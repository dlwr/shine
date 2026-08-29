import {Command, InvalidArgumentError} from 'commander';
import {
  assertDatabaseEnvironment,
  buildEnvironment,
  loadEnvironmentFiles,
} from './common/environment';
import {
  importMainichiPersonNominations,
  MAINICHI_NOMINATION_ARTICLES,
} from './mainichi-person-nominations';

loadEnvironmentFiles();
const environment = buildEnvironment(process.env);

const CATEGORIES = MAINICHI_NOMINATION_ARTICLES.map(
  article => article.category,
);

function parseCategory(value: string): string {
  if (!CATEGORIES.includes(value)) {
    throw new InvalidArgumentError(
      `categoryは次のいずれかで指定してください: ${CATEGORIES.join(' / ')}`,
    );
  }

  return value;
}

function parseYear(value: string): number {
  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 1946) {
    throw new InvalidArgumentError('yearは1946以上の整数で指定してください。');
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
  .name('mainichi-person-nominations')
  .description(
    [
      '日本語版Wikipediaの毎日映画コンクールの部門別記事（男優主演賞など）から',
      '演技賞のノミネートを取り込みます。ノミネートの表がある年度だけが対象で、',
      '受賞者は表の背景色で判定します。作品の同定と人物の引き当ては',
      'japan-person-awards と同じ経路です。',
    ].join('\n'),
  )
  .option('--category <name>', '取り込む部門を1つに絞る', parseCategory)
  .option('--year <year>', '取り込む年度を1つに絞る', parseYear)
  .option('--dry-run', '実際の書き込みは行わず、取得結果のみ表示', false)
  .option('--throttle <ms>', 'TMDb呼び出し間の待機ミリ秒', parseThrottle, 300)
  .addHelpText(
    'after',
    `
部門: ${CATEGORIES.join(' / ')}

例:
  pnpm run scrapers:mainichi-person-nominations --dry-run
  pnpm run scrapers:mainichi-person-nominations --category 主演俳優賞 --year 2025
`,
  );

program.parse();

const options = program.opts<{
  category?: string;
  year?: number;
  dryRun: boolean;
  throttle: number;
}>();

if (!options.dryRun) {
  assertDatabaseEnvironment(environment);
}

const stats = await importMainichiPersonNominations({
  environment,
  category: options.category,
  dryRun: options.dryRun,
  year: options.year,
  throttleMs: options.throttle,
});

if (stats.failed > 0) {
  process.exitCode = 1;
}
