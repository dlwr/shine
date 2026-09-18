/**
 * ノミネーションに紐づかない映画をソフト削除するCLI
 */
import {Command, InvalidArgumentError} from 'commander';
import {applyOption, dryRunOption, isDryRun} from './common/write-mode';
import {
  assertDatabaseEnvironment,
  buildEnvironment,
  loadEnvironmentFiles,
} from './common/environment';
import {deleteOrphanMovies} from './delete-orphan-movies';

function parsePositiveInteger(label: string) {
  return (value: string): number => {
    const parsed = Number(value);

    if (!Number.isSafeInteger(parsed) || parsed < 0) {
      throw new InvalidArgumentError(
        `${label}は0以上の整数で指定してください。`,
      );
    }

    return parsed;
  };
}

export function createCommand(): Command {
  return new Command()
    .name('delete-orphan-movies')
    .description(
      [
        'ノミネーションが1件も無い映画をソフト削除します。',
        'IMDb IDを持つ映画はIMDb側のタイトルと突き合わせ、',
        '別作品を指していた場合はunique制約を解放するためIDも空にします。',
      ].join('\n'),
    )
    .option('--limit <count>', '処理件数の上限', parsePositiveInteger('limit'))
    .addOption(applyOption())
    .addOption(dryRunOption())
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
  pnpm scrapers delete-orphan-movies
  pnpm scrapers delete-orphan-movies --limit 20
  pnpm scrapers delete-orphan-movies --limit 20 --apply
`,
    )
    .action(
      async (options: {limit?: number; apply?: boolean; throttle: number}) => {
        try {
          loadEnvironmentFiles();
          const environment = buildEnvironment(process.env);

          assertDatabaseEnvironment(environment);

          if (!environment.TMDB_API_KEY) {
            console.warn(
              '警告: TMDB_API_KEY が設定されていません。IMDbとの突き合わせはスキップされます。',
            );
          }

          const stats = await deleteOrphanMovies({
            environment,
            dryRun: isDryRun(options),
            limit: options.limit,
            throttleMs: options.throttle,
          });

          if (stats.failed > 0) {
            process.exitCode = 1;
          }
        } catch (error) {
          console.error('削除処理中にエラーが発生しました:', error);
          process.exitCode = 1;
        }
      },
    );
}
