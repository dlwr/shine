/**
 * TMDbから日本語のあらすじを取り込むCLI
 */
import {Command, InvalidArgumentError} from 'commander';
import {
  assertDatabaseEnvironment,
  buildEnvironment,
  loadEnvironmentFiles,
} from './common/environment';
import {getScrapeDatabase} from './common/dry-run';
import {importMovieDescriptions} from './movie-descriptions';

loadEnvironmentFiles();
const environment = buildEnvironment(process.env);

function parsePositiveInteger(value: string): number {
  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new InvalidArgumentError('1以上の整数を指定してください。');
  }

  return parsed;
}

const program = new Command();

program
  .name('movie-descriptions')
  .description(
    [
      'TMDbの詳細API(language=ja-JP)から日本語のあらすじを取り込みます。',
      'translations（movie_description / ja）に保存され、',
      '日本語を含まない結果は保存しません。',
      'あらすじを取得済みの映画は既定でスキップします。',
    ].join('\n'),
  )
  .option('--limit <n>', '処理する映画の件数上限', parsePositiveInteger)
  .option('--force', '取得済みの映画も取り直す', false)
  .option('--throttle <ms>', 'リクエスト間隔(ms)', parsePositiveInteger, 150)
  .option(
    '--concurrency <n>',
    '同時に処理する映画の数',
    parsePositiveInteger,
    5,
  )
  .option('--dry-run', '書き込みは行わず、件数のみ集計', false)
  .addHelpText(
    'after',
    `
例:
  pnpm run scrapers:movie-descriptions --limit 10 --dry-run
  pnpm run scrapers:movie-descriptions --limit 100
  pnpm run scrapers:movie-descriptions
`,
  )
  .action(
    async (options: {
      limit?: number;
      force: boolean;
      throttle: number;
      concurrency: number;
      dryRun: boolean;
    }) => {
      assertDatabaseEnvironment(environment);

      if (!environment.TMDB_API_KEY) {
        throw new Error('TMDB_API_KEY が設定されていません。');
      }

      const database = getScrapeDatabase({
        environment,
        isDryRun: options.dryRun,
      });

      const result = await importMovieDescriptions(
        {database, environment, isDryRun: options.dryRun},
        {
          force: options.force,
          limit: options.limit,
          throttleMs: options.throttle,
          concurrency: options.concurrency,
          onProgress(done, total) {
            if (done === total || done % 100 === 0) {
              console.log(`  ${done}/${total}`);
            }
          },
        },
      );

      console.log('\n結果:');
      console.log(`  取り込み: ${result.saved}`);
      console.log(`  日本語のあらすじなし: ${result.missing}`);
      console.log(`  スキップ: ${result.skipped}`);
      console.log(`  失敗: ${result.failed}`);

      if (result.failed > 0) {
        process.exitCode = 1;
      }
    },
  );

try {
  await program.parseAsync(process.argv);
} catch (error) {
  console.error('あらすじ取り込み中にエラーが発生しました:', error);
  process.exitCode = 1;
}
