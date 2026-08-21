/**
 * 日刊スポーツ映画大賞取り込みのCLIエントリーポイント
 */
import {Command, InvalidArgumentError} from 'commander';
import {
  assertDatabaseEnvironment,
  buildEnvironment,
  loadEnvironmentFiles,
} from './common/environment';
import {importNikkanSportsFilmAwards} from './nikkan-sports-film-awards';

loadEnvironmentFiles();
const environment = buildEnvironment(process.env);

function parseYear(value: string): number {
  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 1988) {
    throw new InvalidArgumentError('yearは1988以上の整数で指定してください。');
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

const program = new Command();

program
  .name('nikkan-sports-film-awards')
  .description(
    [
      '日本語版Wikipediaの「日刊スポーツ映画大賞・石原裕次郎賞」から',
      '作品賞・外国作品賞・石原裕次郎賞を取り込みます。',
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
  pnpm run scrapers:nikkan-sports-film-awards --dry-run
  pnpm run scrapers:nikkan-sports-film-awards --year 2025
`,
  );

program.parse();

const options = program.opts<{
  year?: number;
  dryRun: boolean;
  throttle: number;
}>();

if (!options.dryRun) {
  assertDatabaseEnvironment(environment);
}

const stats = await importNikkanSportsFilmAwards({
  environment,
  dryRun: options.dryRun,
  year: options.year,
  throttleMs: options.throttle,
});

const failed =
  stats.bestFilm.failed + stats.foreign.failed + stats.yujiro.failed;
if (failed > 0) {
  process.exitCode = 1;
}
