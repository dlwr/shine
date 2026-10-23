/**
 * 公開日・上映時間の無い映画を TMDb の詳細で埋めるCLI
 */
import {Command} from 'commander';
import {
  assertDatabaseEnvironment,
  buildEnvironment,
  loadEnvironmentFiles,
} from './common/environment';
import {getScrapeDatabase} from './common/dry-run';
import {backfillMovieDetails} from './backfill-movie-details';
import {integerAtLeast} from './common/cli-options';

export function createCommand(): Command {
  return new Command()
    .name('backfill-movie-details')
    .description(
      [
        '公開日・上映時間が空の映画を TMDb の詳細で埋めます。',
        '既にある値は書き換えません。TMDb の上映時間 0 は不明として扱います。',
      ].join('\n'),
    )
    .option('--limit <n>', '処理する映画の件数上限', integerAtLeast(1, 'limit'))
    .option('--dry-run', '実際の書き込みは行わず、処理内容のみ表示', false)
    .option(
      '--throttle <ms>',
      'リクエスト間隔(ms)',
      integerAtLeast(1, 'throttle'),
      150,
    )
    .option(
      '--concurrency <n>',
      '同時に処理する映画の数',
      integerAtLeast(1, 'concurrency'),
      5,
    )
    .addHelpText(
      'after',
      `
例:
  pnpm scrapers backfill-movie-details --limit 20 --dry-run
  pnpm scrapers backfill-movie-details
`,
    )
    .action(
      async (options: {
        limit?: number;
        dryRun: boolean;
        throttle: number;
        concurrency: number;
      }) => {
        try {
          loadEnvironmentFiles();
          const environment = buildEnvironment(process.env);

          assertDatabaseEnvironment(environment);

          if (!environment.TMDB_API_KEY) {
            throw new Error('TMDB_API_KEY が設定されていません。');
          }

          const result = await backfillMovieDetails(
            {
              database: getScrapeDatabase({
                environment,
                isDryRun: options.dryRun,
              }),
              environment,
              isDryRun: options.dryRun,
            },
            {
              limit: options.limit,
              throttleMs: options.throttle,
              concurrency: options.concurrency,
              onProgress(done, total) {
                if (done === total || done % 500 === 0) {
                  console.log(`  ${done}/${total}`);
                }
              },
            },
          );

          console.log('\n結果:');
          console.log(`  埋めた: ${result.updated}`);
          console.log(`  TMDb にも無い: ${result.missing}`);
          console.log(`  失敗: ${result.failed}`);

          if (result.failed > 0) {
            process.exitCode = 1;
          }
        } catch (error) {
          console.error('映画の詳細の補完中にエラーが発生しました:', error);
          process.exitCode = 1;
        }
      },
    );
}
