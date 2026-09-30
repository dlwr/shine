/**
 * 日本アカデミー賞の個人賞取り込みのCLIエントリーポイント
 */
import {Command} from 'commander';
import {
  assertDatabaseEnvironment,
  buildEnvironment,
  loadEnvironmentFiles,
} from './common/environment';
import {
  importJapanAcademyPersonAwards,
  JAPAN_ACADEMY_PERSON_AWARDS,
} from './japan-academy-person-awards';
import {integerAtLeast, oneOf} from './common/cli-options';

const CATEGORIES = JAPAN_ACADEMY_PERSON_AWARDS.map(award => award.category);

export function createCommand(): Command {
  return new Command()
    .name('japan-academy-person-awards')
    .description(
      [
        '日本語版Wikipediaの「日本アカデミー賞監督賞」などから個人賞を取り込みます。',
        '記事名からWikidataのIMDb ID (P345) を引いて映画を同定し、',
        'その映画のクレジットから人物を引き当てて1人1行で保存します。',
        '最優秀賞は優秀賞の中から選ばれるので、受賞として保存します。',
      ].join('\n'),
    )
    .option(
      '--year <year>',
      '取り込む授賞式の年を1つに絞る',
      integerAtLeast(1978, 'year'),
    )
    .option(
      '--category <name>',
      '取り込む部門を1つに絞る',
      oneOf(CATEGORIES, 'category'),
    )
    .option('--dry-run', '実際の書き込みは行わず、取得結果のみ表示', false)
    .option(
      '--throttle <ms>',
      'TMDb呼び出し間の待機ミリ秒',
      integerAtLeast(0, 'throttle'),
      300,
    )
    .addHelpText(
      'after',
      `
部門: ${CATEGORIES.join(' / ')}

例:
  pnpm scrapers japan-academy-person-awards --dry-run
  pnpm scrapers japan-academy-person-awards --year 2026
  pnpm scrapers japan-academy-person-awards --category 監督賞
`,
    )
    .action(
      async (options: {
        year?: number;
        category?: string;
        dryRun: boolean;
        throttle: number;
      }) => {
        loadEnvironmentFiles();
        const environment = buildEnvironment(process.env);

        if (!options.dryRun) {
          assertDatabaseEnvironment(environment);
        }

        const stats = await importJapanAcademyPersonAwards({
          environment,
          awards:
            options.category === undefined
              ? undefined
              : JAPAN_ACADEMY_PERSON_AWARDS.filter(
                  award => award.category === options.category,
                ),
          dryRun: options.dryRun,
          year: options.year,
          throttleMs: options.throttle,
        });

        if (stats.failed > 0) {
          process.exitCode = 1;
        }
      },
    );
}
