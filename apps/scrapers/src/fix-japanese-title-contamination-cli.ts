/**
 * 邦題の枠に入ったTMDbの原題フォールバックを掃除するCLI
 */
import {Command, InvalidArgumentError} from 'commander';
import {getScrapeDatabase} from './common/dry-run';
import {
  assertDatabaseEnvironment,
  buildEnvironment,
  loadEnvironmentFiles,
} from './common/environment';
import {fixJapaneseTitleContamination} from './fix-japanese-title-contamination';

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
  .name('fix-japanese-title-contamination')
  .description(
    [
      '日本語文字を含まない ja タイトル行をTMDbと突き合わせ、',
      '原題フォールバックと一致する行を原語の行へ移します(原語の行が既にあれば削除)。',
      'TMDbに日本語訳があれば置き換え、それ以外の行は残します。',
      'TMDbで確認できなかった行は削除せず報告します。',
    ].join('\n'),
  )
  .option('--movie <uid>', '1本の映画だけを対象にする')
  .option('--limit <n>', '処理する行数の上限', parsePositiveInteger)
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
  pnpm run scrapers:fix-japanese-title-contamination --movie <uid> --dry-run
  pnpm run scrapers:fix-japanese-title-contamination --limit 100 --dry-run
  pnpm run scrapers:fix-japanese-title-contamination
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

      const result = await fixJapaneseTitleContamination(
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

      console.log(`\n結果${options.dryRun ? ' (dry-run)' : ''}:`);
      console.log(`  走査した行: ${result.scanned}`);
      console.log(`  原語の行へ移動: ${result.relocated}`);
      console.log(`  削除: ${result.deleted}`);
      console.log(`  置換: ${result.replaced}`);
      console.log(`  残した行: ${result.kept}`);
      console.log(`  TMDbで確認できなかった行: ${result.unverified.length}`);

      if (result.keptForeignScript.length > 0) {
        console.log(
          `  ラテン文字も日本語も含まないまま残した行(要手動確認): ${result.keptForeignScript.length}`,
        );
        for (const entry of result.keptForeignScript) {
          console.log(`    ${entry.movieUid} "${entry.content}"`);
        }
      }

      if (result.keptKanjiEqualsOriginal.length > 0) {
        console.log(
          `  漢字だけで原題と同じ行(中国語圏の原題の可能性、要手動確認): ${result.keptKanjiEqualsOriginal.length}`,
        );
        for (const entry of result.keptKanjiEqualsOriginal) {
          console.log(`    ${entry.movieUid} "${entry.content}"`);
        }
      }
    },
  );

try {
  await program.parseAsync(process.argv);
} catch (error) {
  console.error('邦題の掃除中にエラーが発生しました:', error);
  process.exitCode = 1;
}
