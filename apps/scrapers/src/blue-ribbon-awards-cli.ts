/**
 * ブルーリボン賞取り込みのCLIエントリーポイント
 */
import {Command, InvalidArgumentError} from 'commander';
import {importBlueRibbonAwards} from './blue-ribbon-awards';
import {
  assertDatabaseEnvironment,
  buildEnvironment,
  loadEnvironmentFiles,
} from './common/environment';

function parseYear(value: string): number {
  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 1950) {
    throw new InvalidArgumentError('yearは1950以上の整数で指定してください。');
  }

  return parsed;
}

function parseThrottle(value: string): number {
  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new InvalidArgumentError('throttleは0以上の整数で指定してください。');
  }

  return parsed;
}

export function createCommand(): Command {
  return new Command()
    .name('blue-ribbon-awards')
    .description(
      [
        '日本語版Wikipediaの「ブルーリボン賞 (映画)」から作品賞・',
        '外国作品賞を取り込みます。',
        '記事名からWikidataのIMDb ID (P345) を引いて映画を同定するため、',
        'IMDb IDを持たない作品は取り込みません。',
      ].join('\n'),
    )
    .option('--year <year>', '取り込む年度を1つに絞る', parseYear)
    .option('--dry-run', '実際の書き込みは行わず、取得結果のみ表示', false)
    .option('--throttle <ms>', 'TMDb呼び出し間の待機ミリ秒', parseThrottle, 300)
    .addHelpText(
      'after',
      `
例:
  pnpm scrapers blue-ribbon-awards --dry-run
  pnpm scrapers blue-ribbon-awards --year 2025
`,
    )
    .action(
      async (options: {year?: number; dryRun: boolean; throttle: number}) => {
        loadEnvironmentFiles();
        const environment = buildEnvironment(process.env);

        if (!options.dryRun) {
          assertDatabaseEnvironment(environment);
        }

        const stats = await importBlueRibbonAwards({
          environment,
          dryRun: options.dryRun,
          year: options.year,
          throttleMs: options.throttle,
        });

        const failed = stats.bestFilm.failed + stats.foreign.failed;
        if (failed > 0) {
          process.exitCode = 1;
        }
      },
    );
}
