/**
 * ヨコハマ映画祭取り込みのCLIエントリーポイント
 */
import {Command, InvalidArgumentError} from 'commander';
import {
  assertDatabaseEnvironment,
  buildEnvironment,
  loadEnvironmentFiles,
} from './common/environment';
import {importYokohamaFilmFestival} from './yokohama-film-festival';

loadEnvironmentFiles();
const environment = buildEnvironment(process.env);

function parseYear(value: string): number {
  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 1979) {
    throw new InvalidArgumentError('yearは1979以上の整数で指定してください。');
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
  .name('yokohama-film-festival')
  .description(
    [
      '日本語版Wikipediaの「ヨコハマ映画祭」から',
      '日本映画ベストテン（1位が作品賞）を取り込みます。',
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
  pnpm run scrapers:yokohama-film-festival --dry-run
  pnpm run scrapers:yokohama-film-festival --year 2025
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

const stats = await importYokohamaFilmFestival({
  environment,
  dryRun: options.dryRun,
  year: options.year,
  throttleMs: options.throttle,
});

if (stats.failed > 0) {
  process.exitCode = 1;
}
