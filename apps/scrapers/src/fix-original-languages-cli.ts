/**
 * TMDbと食い違っている映画の原語を直すCLI
 */
import {Command, InvalidArgumentError} from 'commander';
import {
  assertDatabaseEnvironment,
  buildEnvironment,
  loadEnvironmentFiles,
} from './common/environment';
import {getScrapeDatabase} from './common/dry-run';
import {fixOriginalLanguages} from './fix-original-languages';

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
  .name('fix-original-languages')
  .description(
    [
      'TMDbの original_language と movies.original_language を突き合わせ、',
      '食い違っている映画を書き換えます。',
      'TMDbが原語を持たない場合と無言語(xx)の場合は書き換えません。',
    ].join('\n'),
  )
  .option('--limit <n>', '処理する映画の件数上限', parsePositiveInteger)
  .option('--throttle <ms>', 'リクエスト間隔(ms)', parsePositiveInteger, 150)
  .option(
    '--concurrency <n>',
    '同時に処理する映画の数',
    parsePositiveInteger,
    5,
  )
  .option('--dry-run', '書き込みは行わず、対象のみ表示', false)
  .addHelpText(
    'after',
    `
例:
  pnpm run scrapers:fix-original-languages --limit 100 --dry-run
  pnpm run scrapers:fix-original-languages
`,
  )
  .action(
    async (options: {
      limit?: number;
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

      const result = await fixOriginalLanguages(
        {database, environment, isDryRun: options.dryRun},
        {
          limit: options.limit,
          throttleMs: options.throttle,
          concurrency: options.concurrency,
          onFix(movieUid, from, to) {
            console.log(`  ${movieUid}: ${from} -> ${to}`);
          },
          onProgress(done, total) {
            if (done === total || done % 500 === 0) {
              console.log(`  ${done}/${total}`);
            }
          },
        },
      );

      console.log('\n結果:');
      console.log(`  書き換え: ${result.updated}`);
      console.log(`  一致: ${result.matched}`);
      console.log(`  原語不明: ${result.unknown}`);
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
  console.error('原語の修正中にエラーが発生しました:', error);
  process.exitCode = 1;
}
