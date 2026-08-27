/**
 * ベルリン国際映画祭の個人賞取り込みのCLIエントリーポイント
 */
import {Command, InvalidArgumentError} from 'commander';
import {
  BERLIN_PERSON_AWARDS,
  importBerlinPersonAwards,
} from './berlin-person-awards';
import {
  assertDatabaseEnvironment,
  buildEnvironment,
  loadEnvironmentFiles,
} from './common/environment';

loadEnvironmentFiles();
const environment = buildEnvironment(process.env);

const CATEGORIES = BERLIN_PERSON_AWARDS.map(award => award.category);

function parseYear(value: string): number {
  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 1951) {
    throw new InvalidArgumentError('yearは1951以上の整数で指定してください。');
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

function parseCategory(value: string): string {
  if (!CATEGORIES.includes(value)) {
    throw new InvalidArgumentError(
      `categoryは次のいずれかで指定してください: ${CATEGORIES.join(' / ')}`,
    );
  }

  return value;
}

const program = new Command();

program
  .name('berlin-person-awards')
  .description(
    [
      '英語版Wikipediaの「Silver Bear for Best Director」「Silver Bear for Best Actor」「Silver Bear for Best Actress」',
      '「Silver Bear for Best Leading Performance」「Silver Bear for Best Supporting Performance」から',
      '銀熊賞の監督賞・男優賞・女優賞（〜2020年）・主演俳優賞・助演俳優賞（2021年〜）を取り込みます。',
      '記事名からWikidataのIMDb ID (P345) を引いて映画を同定し、',
      '受賞者はその映画のクレジットから人物を引き当てて1人1行で保存します。',
    ].join('\n'),
  )
  .option('--year <year>', '取り込む映画祭の開催年を1つに絞る', parseYear)
  .option('--category <name>', '取り込む部門を1つに絞る', parseCategory)
  .option('--dry-run', '実際の書き込みは行わず、取得結果のみ表示', false)
  .option('--throttle <ms>', 'TMDb呼び出し間の待機ミリ秒', parseThrottle, 300)
  .addHelpText(
    'after',
    `
部門:
${CATEGORIES.map(category => `  ${category}`).join('\n')}

例:
  pnpm run scrapers:berlin-person-awards --dry-run
  pnpm run scrapers:berlin-person-awards --year 2025
  pnpm run scrapers:berlin-person-awards --category "Silver Bear for Best Director"
`,
  );

program.parse();

const options = program.opts<{
  year?: number;
  category?: string;
  dryRun: boolean;
  throttle: number;
}>();

if (!options.dryRun) {
  assertDatabaseEnvironment(environment);
}

const stats = await importBerlinPersonAwards({
  environment,
  awards:
    options.category === undefined
      ? undefined
      : BERLIN_PERSON_AWARDS.filter(
          award => award.category === options.category,
        ),
  dryRun: options.dryRun,
  year: options.year,
  throttleMs: options.throttle,
});

if (stats.failed > 0) {
  process.exitCode = 1;
}
