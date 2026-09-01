/**
 * カンヌ国際映画祭のコンペティション部門（パルム・ドール）取り込みのCLIエントリーポイント
 */
import {Command, InvalidArgumentError} from 'commander';
import {importCannesPalmeDOr} from './cannes-palme-dor';
import {
  assertDatabaseEnvironment,
  buildEnvironment,
  loadEnvironmentFiles,
} from './common/environment';

loadEnvironmentFiles();
const environment = buildEnvironment(process.env);

function parseYear(value: string): number {
  const year = Number(value);

  if (!Number.isSafeInteger(year) || year < 1946) {
    throw new InvalidArgumentError('yearは1946以上の整数で指定してください。');
  }

  return year;
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
  .name('cannes-palme-dor')
  .description(
    [
      '英語版Wikipediaの「YYYY Cannes Film Festival」の In Competition の表から',
      'コンペティション部門の出品作を取り込みます。',
      '記事名からWikidataのIMDb ID (P345) を引いて映画を同定し、',
      '背景色の付いた行をパルム・ドール受賞作として保存します。',
    ].join('\n'),
  )
  .requiredOption('--year <year>', '取り込む映画祭の開催年', parseYear)
  .option('--dry-run', '実際の書き込みは行わず、取得結果のみ表示', false)
  .option(
    '--winners-only',
    '出品作は取り込まず、受賞作だけを取り込む（既に出品作が入っている年の受賞漏れを埋める用）',
    false,
  )
  .option('--throttle <ms>', 'TMDb呼び出し間の待機ミリ秒', parseThrottle, 300)
  .addHelpText(
    'after',
    `
例:
  pnpm run scrapers:cannes-palme-dor --year ${new Date().getFullYear()} --dry-run
  pnpm run scrapers:cannes-palme-dor --year ${new Date().getFullYear()}
`,
  );

program.parse();

const options = program.opts<{
  year: number;
  dryRun: boolean;
  winnersOnly: boolean;
  throttle: number;
}>();

if (!options.dryRun) {
  assertDatabaseEnvironment(environment);
}

const stats = await importCannesPalmeDOr({
  environment,
  year: options.year,
  dryRun: options.dryRun,
  winnersOnly: options.winnersOnly,
  throttleMs: options.throttle,
});

if (stats.failed > 0) {
  process.exitCode = 1;
}
