/**
 * TMDbから監督・出演者のクレジットを取り込むCLI
 */
import {Command, InvalidArgumentError} from 'commander';
import {
  assertDatabaseEnvironment,
  buildEnvironment,
  loadEnvironmentFiles,
} from './common/environment';
import {getScrapeDatabase} from './common/dry-run';
import {importMovieCredits} from './movie-credits';

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
  .name('movie-credits')
  .description(
    [
      'TMDbの credits APIから監督・脚本・撮影・音楽・編集と主要キャスト上位10名を取り込みます。',
      '人物は people、作品との対応は movie_credits に入り、',
      '日本語名は translations（person_name / ja）に保存されます。',
      'クレジットを取得済みの映画は既定でスキップします。',
    ].join('\n'),
  )
  .option('--limit <n>', '処理する映画の件数上限', parsePositiveInteger)
  .option('--force', '取得済みの映画も取り直す', false)
  .option('--throttle <ms>', 'リクエスト間隔(ms)', parsePositiveInteger, 250)
  .option('--dry-run', '書き込みは行わず、対象のみ表示', false)
  .addHelpText(
    'after',
    `
例:
  pnpm run scrapers:movie-credits --limit 10 --dry-run
  pnpm run scrapers:movie-credits --limit 100
  pnpm run scrapers:movie-credits
`,
  )
  .action(
    async (options: {
      limit?: number;
      force: boolean;
      throttle: number;
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

      const result = await importMovieCredits(
        {database, environment, isDryRun: options.dryRun},
        {
          force: options.force,
          limit: options.limit,
          throttleMs: options.throttle,
          onProgress(done, total) {
            if (done === total || done % 100 === 0) {
              console.log(`  ${done}/${total}`);
            }
          },
        },
      );

      console.log('\n結果:');
      console.log(`  取り込み: ${result.processed}`);
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
  console.error('クレジット取り込み中にエラーが発生しました:', error);
  process.exitCode = 1;
}
