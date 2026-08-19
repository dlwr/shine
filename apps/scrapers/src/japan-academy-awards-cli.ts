/**
 * 日本アカデミー賞作品賞取り込みのCLIエントリーポイント
 */
import {Command, InvalidArgumentError} from 'commander';
import {
  assertDatabaseEnvironment,
  buildEnvironment,
  loadEnvironmentFiles,
} from './common/environment';
import {importJapanAcademyAwards} from './japan-academy-awards';

loadEnvironmentFiles();
const environment = buildEnvironment(process.env);

function parseYear(value: string): number {
  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 1978) {
    throw new InvalidArgumentError('yearは1978以上の整数で指定してください。');
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
  .name('japan-academy-awards')
  .description(
    [
      '日本語版Wikipediaの「日本アカデミー賞作品賞」から優秀作品賞を取り込みます。',
      '記事名からWikidataのIMDb ID (P345) を引いて映画を同定するため、',
      'IMDb IDを持たない作品は取り込みません。',
      '最優秀作品賞は優秀作品賞の中から選ばれるので、受賞として保存します。',
    ].join('\n'),
  )
  .option('--year <year>', '取り込む授賞式の年を1つに絞る', parseYear)
  .option('--dry-run', '実際の書き込みは行わず、取得結果のみ表示', false)
  .option('--throttle <ms>', 'TMDb呼び出し間の待機ミリ秒', parseThrottle, 300)
  .addHelpText(
    'after',
    `
例:
  pnpm run scrapers:japan-academy-awards --dry-run
  pnpm run scrapers:japan-academy-awards --year 2026
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

const stats = await importJapanAcademyAwards({
  environment,
  dryRun: options.dryRun,
  year: options.year,
  throttleMs: options.throttle,
});

if (stats.failed > 0) {
  process.exitCode = 1;
}
