import {Command} from 'commander';
import {fetchTMDBPerson} from '@shine/tmdb';
import {integerAtLeast} from './common/cli-options';
import {getScrapeDatabase} from './common/dry-run';
import {
  assertDatabaseEnvironment,
  buildEnvironment,
  loadEnvironmentFiles,
} from './common/environment';
import {
  applyOption,
  dryRunOption,
  isDryRun,
  type WriteModeOptions,
} from './common/write-mode';
import {backfillPersonBirthdays} from './person-birthdays';

export function createCommand(): Command {
  return new Command()
    .name('person-birthdays')
    .description(
      [
        '誕生日の無い人物のうち、個人賞の候補か参加作が 3 本以上の人物について、',
        'TMDb の birthday を people.birthday に保存します（/on-this-day の誕生日の欄）。',
        '個人賞の候補、参加作の多い順に引きます。TMDb に誕生日が無い人物は毎回引き直します。',
      ].join('\n'),
    )
    .option('--limit <n>', '処理する人物の件数上限', integerAtLeast(1, 'limit'))
    .option(
      '--throttle <ms>',
      'リクエスト間隔(ms)',
      integerAtLeast(0, 'throttle'),
      50,
    )
    .addOption(applyOption())
    .addOption(dryRunOption())
    .addHelpText(
      'after',
      `
例:
  pnpm scrapers person-birthdays --limit 20
  pnpm scrapers person-birthdays --apply
`,
    )
    .action(
      async (
        options: WriteModeOptions & {limit?: number; throttle: number},
      ) => {
        try {
          loadEnvironmentFiles();
          const environment = buildEnvironment(process.env);
          assertDatabaseEnvironment(environment);

          const tmdbApiKey = environment.TMDB_API_KEY;
          if (!tmdbApiKey) {
            throw new Error('TMDB_API_KEY が設定されていません。');
          }

          const dryRun = isDryRun(options);
          const startedAt = Date.now();
          const result = await backfillPersonBirthdays({
            database: getScrapeDatabase({environment, isDryRun: dryRun}),
            isDryRun: dryRun,
            limit: options.limit,
            throttleMs: options.throttle,
            async fetchBirthday(tmdbId) {
              const person = await fetchTMDBPerson(tmdbId, tmdbApiKey);
              return person?.birthday;
            },
            onProgress(done, total) {
              if (done === total || done % 500 === 0) {
                console.log(`  ${done}/${total}`);
              }
            },
          });

          console.log(`\n結果${dryRun ? '（dry-run）' : ''}:`);
          console.log(`  対象: ${result.candidates}`);
          console.log(`  保存: ${result.saved}`);
          console.log(`  TMDb に誕生日なし: ${result.missing}`);
          console.log(`  失敗: ${result.failed}`);
          console.log(
            `  所要: ${Math.round((Date.now() - startedAt) / 1000)} 秒`,
          );

          if (result.failed > 0) {
            process.exitCode = 1;
          }
        } catch (error) {
          console.error('誕生日の取り込み中にエラーが発生しました:', error);
          process.exitCode = 1;
        }
      },
    );
}
