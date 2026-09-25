import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {Command} from 'commander';
import {loadScraperEnvironment} from './common/environment';
import {getDatabase} from '@shine/database';
import {backupDatabase} from './database-backup';
import {databaseReader} from './d1-import-sql';

const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);

function defaultOutputPath(now: Date): string {
  const date = now.toISOString().slice(0, 10);
  return path.join(REPOSITORY_ROOT, 'tmp', 'backups', `shine-${date}.db`);
}

async function main(options: {out?: string}): Promise<void> {
  const environment = loadScraperEnvironment();
  const outputPath = path.resolve(options.out ?? defaultOutputPath(new Date()));
  const started = Date.now();

  const result = await backupDatabase(
    databaseReader(getDatabase(environment)),
    outputPath,
  );

  console.log(
    `${result.outputPath}: movies ${result.movies} 件、integrity_check ${result.integrity}、${Math.round((Date.now() - started) / 1000)} 秒`,
  );

  if (result.integrity !== 'ok') {
    process.exitCode = 1;
  }
}

export function createCommand(): Command {
  return new Command()
    .name('database-backup')
    .description(
      '本番の D1 を proxy 経由で読み、1 ファイルの SQLite に固めます',
    )
    .option(
      '--out <path>',
      '出力先 (default: tmp/backups/shine-<YYYY-MM-DD>.db)',
    )
    .addHelpText(
      'after',
      `
Examples:
  pnpm scrapers database-backup
  pnpm scrapers database-backup --out /Volumes/ExternalSSD/backup/shine.db

Environment variables:
  D1_PROXY_URL        本番の D1 の proxy
  D1_PROXY_KEY        proxy の鍵
`,
    )
    .action(main);
}
