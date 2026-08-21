/**
 * 他作品のポスター混入を掃除するCLI
 */
import {Command, InvalidArgumentError} from 'commander';
import {getScrapeDatabase} from './common/dry-run';
import {
  assertDatabaseEnvironment,
  buildEnvironment,
  loadEnvironmentFiles,
} from './common/environment';
import {fixPosterContamination} from './fix-poster-contamination';

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
  .name('fix-poster-contamination')
  .description(
    [
      '各映画のポスターをTMDbの実画像セットと突き合わせ、',
      'セットに無いもの(他作品の混入やTMDb側で削除済みのもの)を削除します。',
      'あわせてprimaryポスターをja優先で1枚に正規化します。',
      '全ポスターがセットに無い映画はID誤りの疑いがあるため削除せず報告します。',
    ].join('\n'),
  )
  .option('--movie <uid>', '1本の映画だけを対象にする')
  .option('--limit <n>', '処理する映画の件数上限', parsePositiveInteger)
  .option(
    '--throttle <ms>',
    'TMDbリクエスト間隔(ms)',
    parsePositiveInteger,
    100,
  )
  .option('--dry-run', '書き込みは行わず、対象のみ表示', false)
  .addHelpText(
    'after',
    `
例:
  pnpm run scrapers:fix-poster-contamination --movie <uid> --dry-run
  pnpm run scrapers:fix-poster-contamination --limit 100 --dry-run
  pnpm run scrapers:fix-poster-contamination
`,
  )
  .action(
    async (options: {
      movie?: string;
      limit?: number;
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

      const result = await fixPosterContamination(
        {database, environment, isDryRun: options.dryRun},
        {
          movieUid: options.movie,
          limit: options.limit,
          throttleMs: options.throttle,
          onMovie(line) {
            console.log(line);
          },
        },
      );

      console.log('\n結果:');
      console.log(`  走査した映画: ${result.moviesScanned}`);
      console.log(`  削除があった映画: ${result.moviesWithDeletions}`);
      console.log(`  削除したポスター: ${result.postersDeleted}`);
      console.log(`  primaryを整理した映画: ${result.primariesFixed}`);
      console.log(`  検証できなかった映画: ${result.unverified}`);

      if (result.zeroOverlap.length > 0) {
        console.log(
          `  全ポスター不一致(要手動確認): ${result.zeroOverlap.length}`,
        );
        for (const entry of result.zeroOverlap) {
          console.log(`    ${entry.movieUid} (${entry.posters}枚)`);
        }
      }
    },
  );

try {
  await program.parseAsync(process.argv);
} catch (error) {
  console.error('ポスター混入の修正中にエラーが発生しました:', error);
  process.exitCode = 1;
}
