/**
 * 他作品のポスター混入を掃除するCLI
 */
import {Command, InvalidArgumentError} from 'commander';
import {applyOption, dryRunOption, isDryRun} from './common/write-mode';
import {getScrapeDatabase} from './common/dry-run';
import {
  assertDatabaseEnvironment,
  buildEnvironment,
  loadEnvironmentFiles,
} from './common/environment';
import {fixPosterContamination} from './fix-poster-contamination';

function parsePositiveInteger(value: string): number {
  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new InvalidArgumentError('1以上の整数を指定してください。');
  }

  return parsed;
}

export function createCommand(): Command {
  return new Command()
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
    .addOption(applyOption())
    .addOption(dryRunOption())
    .addHelpText(
      'after',
      `
例:
  pnpm scrapers fix-poster-contamination --movie <uid>
  pnpm scrapers fix-poster-contamination --limit 100
  pnpm scrapers fix-poster-contamination --limit 100 --apply
`,
    )
    .action(
      async (options: {
        movie?: string;
        limit?: number;
        throttle: number;
        apply?: boolean;
        dryRun?: boolean;
      }) => {
        try {
          loadEnvironmentFiles();
          const environment = buildEnvironment(process.env);

          assertDatabaseEnvironment(environment);

          if (!environment.TMDB_API_KEY) {
            throw new Error('TMDB_API_KEY が設定されていません。');
          }

          const database = getScrapeDatabase({
            environment,
            isDryRun: isDryRun(options),
          });

          const result = await fixPosterContamination(
            {database, environment, isDryRun: isDryRun(options)},
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
        } catch (error) {
          console.error('ポスター混入の修正中にエラーが発生しました:', error);
          process.exitCode = 1;
        }
      },
    );
}
