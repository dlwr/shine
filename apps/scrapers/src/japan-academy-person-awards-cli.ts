/**
 * 日本アカデミー賞の個人賞取り込みのCLIエントリーポイント
 */
import {Command, InvalidArgumentError} from 'commander';
import {
  assertDatabaseEnvironment,
  buildEnvironment,
  loadEnvironmentFiles,
} from './common/environment';
import {
  importJapanAcademyPersonAwards,
  JAPAN_ACADEMY_PERSON_AWARDS,
} from './japan-academy-person-awards';

loadEnvironmentFiles();
const environment = buildEnvironment(process.env);

const CATEGORIES = JAPAN_ACADEMY_PERSON_AWARDS.map(award => award.category);

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
  .name('japan-academy-person-awards')
  .description(
    [
      '日本語版Wikipediaの「日本アカデミー賞監督賞」などから個人賞を取り込みます。',
      '記事名からWikidataのIMDb ID (P345) を引いて映画を同定し、',
      'その映画のクレジットから人物を引き当てて1人1行で保存します。',
      '最優秀賞は優秀賞の中から選ばれるので、受賞として保存します。',
    ].join('\n'),
  )
  .option('--year <year>', '取り込む授賞式の年を1つに絞る', parseYear)
  .option('--category <name>', '取り込む部門を1つに絞る', parseCategory)
  .option('--dry-run', '実際の書き込みは行わず、取得結果のみ表示', false)
  .option('--throttle <ms>', 'TMDb呼び出し間の待機ミリ秒', parseThrottle, 300)
  .addHelpText(
    'after',
    `
部門: ${CATEGORIES.join(' / ')}

例:
  pnpm run scrapers:japan-academy-person-awards --dry-run
  pnpm run scrapers:japan-academy-person-awards --year 2026
  pnpm run scrapers:japan-academy-person-awards --category 監督賞
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

const stats = await importJapanAcademyPersonAwards({
  environment,
  awards:
    options.category === undefined
      ? undefined
      : JAPAN_ACADEMY_PERSON_AWARDS.filter(
          award => award.category === options.category,
        ),
  dryRun: options.dryRun,
  year: options.year,
  throttleMs: options.throttle,
});

if (stats.failed > 0) {
  process.exitCode = 1;
}
