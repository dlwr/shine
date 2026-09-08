/**
 * 報知映画賞取り込みのCLIエントリーポイント
 */
import {Command, InvalidArgumentError} from 'commander';
import {
  assertDatabaseEnvironment,
  buildEnvironment,
  loadEnvironmentFiles,
} from './common/environment';
import {importHochiFilmAwards} from './hochi-film-awards';

function parseYear(value: string): number {
  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 1976) {
    throw new InvalidArgumentError('yearは1976以上の整数で指定してください。');
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
    .name('hochi-film-awards')
    .description(
      [
        '日本語版Wikipediaの「報知映画賞」から作品賞・',
        '作品賞・海外部門を取り込みます。',
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
  pnpm scrapers hochi-film-awards --dry-run
  pnpm scrapers hochi-film-awards --year 2025
`,
    )
    .action(
      async (options: {year?: number; dryRun: boolean; throttle: number}) => {
        loadEnvironmentFiles();
        const environment = buildEnvironment(process.env);

        if (!options.dryRun) {
          assertDatabaseEnvironment(environment);
        }

        const stats = await importHochiFilmAwards({
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
