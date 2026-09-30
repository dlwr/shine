/**
 * 日本アカデミー賞作品賞取り込みのCLIエントリーポイント
 */
import {Command} from 'commander';
import {
  assertDatabaseEnvironment,
  buildEnvironment,
  loadEnvironmentFiles,
} from './common/environment';
import {importJapanAcademyAwards} from './japan-academy-awards';
import {integerAtLeast} from './common/cli-options';

export function createCommand(): Command {
  return new Command()
    .name('japan-academy-awards')
    .description(
      [
        '日本語版Wikipediaの「日本アカデミー賞作品賞」から優秀作品賞を取り込みます。',
        '記事名からWikidataのIMDb ID (P345) を引いて映画を同定するため、',
        'IMDb IDを持たない作品は取り込みません。',
        '最優秀作品賞は優秀作品賞の中から選ばれるので、受賞として保存します。',
      ].join('\n'),
    )
    .option(
      '--year <year>',
      '取り込む授賞式の年を1つに絞る',
      integerAtLeast(1978, 'year'),
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
例:
  pnpm scrapers japan-academy-awards --dry-run
  pnpm scrapers japan-academy-awards --year 2026
`,
    )
    .action(
      async (options: {year?: number; dryRun: boolean; throttle: number}) => {
        loadEnvironmentFiles();
        const environment = buildEnvironment(process.env);

        if (!options.dryRun) {
          assertDatabaseEnvironment(environment);
        }

        const stats = await importJapanAcademyAwards({
          environment,
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
