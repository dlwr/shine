import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {getDatabase, runStatementsOnProxy} from '@shine/database';
import {Command} from 'commander';
import {loadScraperEnvironment} from './common/environment';
import {
  applyOption,
  dryRunOption,
  isDryRun,
  type WriteModeOptions,
} from './common/write-mode';
import {pendingMigrationStatements} from './database-migrate';

const MIGRATIONS_FOLDER = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../packages/database/migrations',
);

async function main(options: WriteModeOptions): Promise<void> {
  const environment = loadScraperEnvironment();
  if (!environment.D1_PROXY_URL) {
    console.error(
      'D1_PROXY_URL が設定されていません（Turso には pnpm db:migrate:prod を使う）',
    );
    process.exitCode = 1;
    return;
  }

  const statements = await pendingMigrationStatements(
    getDatabase(environment),
    MIGRATIONS_FOLDER,
  );
  if (statements.length === 0) {
    console.log('未適用のマイグレーションはありません');
    return;
  }

  for (const statement of statements) {
    console.log(`${statement};`);
  }

  if (isDryRun(options)) {
    console.log(`\n[DRY RUN] ${statements.length} 文。流すには --apply`);
    return;
  }

  await runStatementsOnProxy(
    {url: environment.D1_PROXY_URL, key: environment.D1_PROXY_KEY ?? ''},
    statements,
  );
  console.log(`\n${statements.length} 文を 1 回の batch で流しました`);
}

export function createCommand(): Command {
  return new Command()
    .name('database-migrate')
    .description(
      '未適用のマイグレーションを D1 の proxy 経由で 1 回の batch として流します',
    )
    .addOption(dryRunOption())
    .addOption(applyOption())
    .addHelpText(
      'after',
      `
Examples:
  pnpm scrapers database-migrate
  pnpm scrapers database-migrate --apply

Environment variables:
  D1_PROXY_URL  D1 の proxy
  D1_PROXY_KEY  proxy の鍵
`,
    )
    .action(main);
}
