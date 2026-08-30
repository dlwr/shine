/**
 * 日本の映画賞（キネマ旬報・毎日映画コンクール・ブルーリボン賞・報知映画賞・
 * ヨコハマ映画祭・日刊スポーツ映画大賞）の個人賞取り込みのCLIエントリーポイント
 */
import {Command, InvalidArgumentError} from 'commander';
import {
  assertDatabaseEnvironment,
  buildEnvironment,
  loadEnvironmentFiles,
} from './common/environment';
import {
  findJapanPersonAwardSource,
  importJapanPersonAwards,
  JAPAN_PERSON_AWARD_SOURCES,
} from './japan-person-awards';

loadEnvironmentFiles();
const environment = buildEnvironment(process.env);

const AWARDS = JAPAN_PERSON_AWARD_SOURCES.map(source => source.key);
const CATEGORIES = [
  ...new Set(
    JAPAN_PERSON_AWARD_SOURCES.flatMap(source =>
      source.categories.map(category => category.category),
    ),
  ),
];

function parseAward(value: string): string {
  if (findJapanPersonAwardSource(value) === undefined) {
    throw new InvalidArgumentError(
      `awardは次のいずれかで指定してください: ${AWARDS.join(' / ')}`,
    );
  }

  return value;
}

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

  if (!Number.isSafeInteger(parsed) || parsed < 1924) {
    throw new InvalidArgumentError('yearは1924以上の整数で指定してください。');
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
  .name('japan-person-awards')
  .description(
    [
      '日本語版Wikipediaの「キネマ旬報」「毎日映画コンクール」「ブルーリボン賞 (映画)」',
      '「報知映画賞」「ヨコハマ映画祭」「日刊スポーツ映画大賞・石原裕次郎賞」の記事から',
      '監督賞・演技賞の受賞者を取り込みます。',
      '記事名からWikidataのIMDb ID (P345) を引いて映画を同定し、',
      'その映画のクレジットから人物を引き当てて1人1行で保存します。',
    ].join('\n'),
  )
  .option('--award <name>', '取り込む賞を1つに絞る', parseAward)
  .option('--category <name>', '取り込む部門を1つに絞る', parseCategory)
  .option('--year <year>', '取り込む年度を1つに絞る', parseYear)
  .option('--dry-run', '実際の書き込みは行わず、取得結果のみ表示', false)
  .option('--throttle <ms>', 'TMDb呼び出し間の待機ミリ秒', parseThrottle, 300)
  .addHelpText(
    'after',
    `
賞: ${AWARDS.join(' / ')}
部門: ${CATEGORIES.join(' / ')}

例:
  pnpm run scrapers:japan-person-awards --dry-run
  pnpm run scrapers:japan-person-awards --award blue-ribbon --year 2025
  pnpm run scrapers:japan-person-awards --award mainichi --category 監督賞
`,
  );

program.parse();

const options = program.opts<{
  award?: string;
  category?: string;
  year?: number;
  dryRun: boolean;
  throttle: number;
}>();

if (!options.dryRun) {
  assertDatabaseEnvironment(environment);
}

const stats = await importJapanPersonAwards({
  environment,
  sources:
    options.award === undefined
      ? undefined
      : JAPAN_PERSON_AWARD_SOURCES.filter(
          source => source.key === options.award,
        ),
  category: options.category,
  dryRun: options.dryRun,
  year: options.year,
  throttleMs: options.throttle,
});

if (stats.failed > 0) {
  process.exitCode = 1;
}
