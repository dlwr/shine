/**
 * ゴールデングローブ賞取り込みのCLIエントリーポイント
 */
import {Command} from 'commander';
import {
  GOLDEN_GLOBE_AWARDS,
  importGoldenGlobeAwards,
} from './golden-globe-awards';
import {
  assertDatabaseEnvironment,
  buildEnvironment,
  loadEnvironmentFiles,
} from './common/environment';
import {integerAtLeast, oneOf} from './common/cli-options';

const CATEGORIES = GOLDEN_GLOBE_AWARDS.map(award => award.category);

export function createCommand(): Command {
  return new Command()
    .name('golden-globe-awards')
    .description(
      [
        '英語版Wikipediaの「Golden Globe Award for Best Motion Picture – Drama」などから作品賞と個人賞を取り込みます。',
        '記事名からWikidataのIMDb ID (P345) を引いて映画を同定し、',
        '個人賞はその映画のクレジットから人物を引き当てて1人1行で保存します。',
      ].join('\n'),
    )
    .option(
      '--year <year>',
      '取り込む授賞式の年を1つに絞る',
      integerAtLeast(1944, 'year'),
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
部門:
${CATEGORIES.map(category => `  ${category}`).join('\n')}

例:
  pnpm scrapers golden-globe-awards --dry-run
  pnpm scrapers golden-globe-awards --year 2026
  pnpm scrapers golden-globe-awards --category "Golden Globe Award for Best Director"
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

        const stats = await importGoldenGlobeAwards({
          environment,
          awards:
            options.category === undefined
              ? undefined
              : GOLDEN_GLOBE_AWARDS.filter(
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
