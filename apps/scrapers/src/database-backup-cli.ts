/**
 * 本番の Turso を埋め込みレプリカとして同期し、1 ファイルの SQLite に固める。
 * 読み取りは bytes synced として数えられ、rows read には乗らない。
 */
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {Command} from 'commander';
import {loadScraperEnvironment} from './common/environment';
import {getDatabase} from '@shine/database';
import {backupD1Database, backupDatabase} from './database-backup';
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

  const result = environment.D1_PROXY_URL
    ? await backupD1Database(
        databaseReader(getDatabase(environment)),
        outputPath,
      )
    : await backupDatabase(
        {
          url: environment.TURSO_DATABASE_URL,
          authToken: environment.TURSO_AUTH_TOKEN,
        },
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
      '本番の Turso を埋め込みレプリカとして同期し、1 ファイルの SQLite に固めます',
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
  D1_PROXY_URL        あれば D1 から proxy 経由で取る
  D1_PROXY_KEY        proxy の鍵
  TURSO_DATABASE_URL  D1_PROXY_URL が無いときの同期元 (libsql://...)
  TURSO_AUTH_TOKEN    同期元のトークン
`,
    )
    .action(main);
}
