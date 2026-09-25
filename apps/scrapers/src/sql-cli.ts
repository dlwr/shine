/**
 * 本番（.env の D1 の proxy か Turso）に読み取り専用の SQL を 1 文流す。
 * 書き込みの句は実行前に拒否する。Turso では読み取りトランザクションもコミットしない。
 */
import process from 'node:process';
import {Command, InvalidArgumentError} from 'commander';
import {d1ProxyOf, loadScraperEnvironment} from './common/environment';
import {
  formatQueryResult,
  type QueryFormat,
  runReadOnlyQuery,
  runReadOnlyQueryOnD1,
} from './sql-query';

function parseFormat(value: string): QueryFormat {
  if (value === 'tsv' || value === 'json') {
    return value;
  }

  throw new InvalidArgumentError('--format は tsv か json を指定してください');
}

async function main(
  query: string,
  options: {format: QueryFormat},
): Promise<void> {
  const environment = loadScraperEnvironment();

  try {
    const proxy = d1ProxyOf(environment);
    const result = proxy
      ? await runReadOnlyQueryOnD1(proxy, query)
      : await runReadOnlyQuery(
          {
            url: environment.TURSO_DATABASE_URL,
            authToken: environment.TURSO_AUTH_TOKEN,
          },
          query,
        );
    console.log(formatQueryResult(result, options.format));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

export function createCommand(): Command {
  return new Command()
    .name('sql')
    .description(
      '.env の D1 の proxy か Turso に読み取り専用の SQL を 1 文流します（SELECT・WITH・EXPLAIN のみ）',
    )
    .argument('<query>', '実行する SQL')
    .option(
      '--format <tsv|json>',
      '出力形式 (default: tsv)',
      parseFormat,
      'tsv',
    )
    .addHelpText(
      'after',
      `
Examples:
  pnpm scrapers sql "SELECT count(*) AS n FROM movies WHERE deleted_at IS NULL"
  pnpm scrapers sql --format json "SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'nominations'"
  pnpm scrapers sql "EXPLAIN QUERY PLAN SELECT * FROM movies WHERE year = 2015"

Environment variables:
  TURSO_DATABASE_URL  接続先 (libsql://... または file:...)
  TURSO_AUTH_TOKEN    接続先のトークン
`,
    )
    .action(main);
}
