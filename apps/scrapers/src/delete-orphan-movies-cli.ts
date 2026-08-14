/**
 * ノミネーションに紐づかない映画をソフト削除するCLI
 */
import {Command, InvalidArgumentError} from 'commander';
import {
  assertDatabaseEnvironment,
  buildEnvironment,
  loadEnvironmentFiles,
} from './common/environment';
import {deleteOrphanMovies} from './delete-orphan-movies';

loadEnvironmentFiles();
const environment = buildEnvironment(process.env);

function parsePositiveInteger(label: string) {
  return (value: string): number => {
    const parsed = Number.parseInt(value, 10);

    if (Number.isNaN(parsed) || parsed < 0) {
      throw new InvalidArgumentError(
        `${label}は0以上の整数で指定してください。`,
      );
    }

    return parsed;
  };
}

const program = new Command();

program
  .name('delete-orphan-movies')
  .description(
    [
      'ノミネーションが1件も無い映画をソフト削除します。',
      'IMDb IDを持つ映画はIMDb側のタイトルと突き合わせ、',
      '別作品を指していた場合はunique制約を解放するためIDも空にします。',
    ].join('\n'),
  )
  .option('--limit <count>', '処理件数の上限', parsePositiveInteger('limit'))
  .option('--dry-run', '実際の削除は行わず、対象と判定のみ表示', false)
  .option(
    '--throttle <ms>',
    'IMDb照合リクエスト間の待機ミリ秒 (デフォルト: 300)',
    parsePositiveInteger('throttle'),
    300,
  )
  .addHelpText(
    'after',
    `
例:
  pnpm run scrapers:delete-orphan-movies --dry-run
  pnpm run scrapers:delete-orphan-movies --limit 20
  pnpm run scrapers:delete-orphan-movies
`,
  )
  .action(
    async (options: {limit?: number; dryRun: boolean; throttle: number}) => {
      assertDatabaseEnvironment(environment);

      if (!environment.TMDB_API_KEY) {
        console.warn(
          '警告: TMDB_API_KEY が設定されていません。IMDbとの突き合わせはスキップされます。',
        );
      }

      const stats = await deleteOrphanMovies({
        environment,
        dryRun: options.dryRun,
        limit: options.limit,
        throttleMs: options.throttle,
      });

      if (stats.failed > 0) {
        process.exitCode = 1;
      }
    },
  );

try {
  await program.parseAsync(process.argv);
} catch (error) {
  console.error('削除処理中にエラーが発生しました:', error);
  process.exitCode = 1;
}
