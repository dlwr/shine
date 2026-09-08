/**
 * 原語がラテン文字でも日本語でもない人物に TMDb の英語表記を足すCLI
 */
import {Command, InvalidArgumentError} from 'commander';
import {
  assertDatabaseEnvironment,
  buildEnvironment,
  loadEnvironmentFiles,
} from './common/environment';
import {getScrapeDatabase} from './common/dry-run';
import {fetchTMDBPerson} from './common/tmdb-utilities';
import {backfillPersonEnglishNames} from './person-english-names';

function parsePositiveInteger(value: string): number {
  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new InvalidArgumentError('1以上の整数を指定してください。');
  }

  return parsed;
}

export function createCommand(): Command {
  return new Command()
    .name('person-english-names')
    .description(
      [
        'people.name がハングル・キリル文字・ヘブライ文字などの人物について、',
        'TMDb の en-US の name を translations（person_name / en）に保存します。',
        'API は ja の翻訳が無い人物にこの英語表記を使います。',
        'en の翻訳がある人物はスキップするので、何度流しても増えません。',
      ].join('\n'),
    )
    .option('--limit <n>', '処理する人物の件数上限', parsePositiveInteger)
    .option('--throttle <ms>', 'リクエスト間隔(ms)', parsePositiveInteger, 100)
    .option('--dry-run', '書き込みは行わず、対象のみ表示', false)
    .addHelpText(
      'after',
      `
例:
  pnpm scrapers person-english-names --limit 10 --dry-run
  pnpm scrapers person-english-names
`,
    )
    .action(
      async (options: {limit?: number; throttle: number; dryRun: boolean}) => {
        try {
          loadEnvironmentFiles();
          const environment = buildEnvironment(process.env);

          assertDatabaseEnvironment(environment);

          const tmdbApiKey = environment.TMDB_API_KEY;
          if (!tmdbApiKey) {
            throw new Error('TMDB_API_KEY が設定されていません。');
          }

          const database = getScrapeDatabase({
            environment,
            isDryRun: options.dryRun,
          });

          const result = await backfillPersonEnglishNames({
            database,
            isDryRun: options.dryRun,
            limit: options.limit,
            throttleMs: options.throttle,
            async fetchEnglishName(tmdbId) {
              const person = await fetchTMDBPerson(tmdbId, tmdbApiKey, 'en-US');
              return person?.name;
            },
            onProgress(done, total) {
              if (done === total || done % 100 === 0) {
                console.log(`  ${done}/${total}`);
              }
            },
          });

          console.log(`\n結果${options.dryRun ? '（dry-run）' : ''}:`);
          console.log(`  対象: ${result.candidates}`);
          console.log(`  保存: ${result.saved}`);
          console.log(`  スキップ: ${result.skipped}`);
          console.log(`  失敗: ${result.failed}`);

          if (result.failed > 0) {
            process.exitCode = 1;
          }
        } catch (error) {
          console.error('英語名の取り込み中にエラーが発生しました:', error);
          process.exitCode = 1;
        }
      },
    );
}
