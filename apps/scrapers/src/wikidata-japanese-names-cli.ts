import {Command, InvalidArgumentError} from 'commander';
import {
  assertDatabaseEnvironment,
  buildEnvironment,
  loadEnvironmentFiles,
} from './common/environment';
import {importJapaneseNamesFromWikidata} from './wikidata-japanese-names';

loadEnvironmentFiles();
const environment = buildEnvironment(process.env);

function parsePositiveInteger(label: string) {
  return (value: string): number => {
    const parsed = Number(value);

    if (!Number.isSafeInteger(parsed) || parsed < 0) {
      throw new InvalidArgumentError(
        `${label}は0以上の整数で指定してください。`,
      );
    }

    return parsed;
  };
}

const program = new Command();

program
  .name('wikidata-japanese-names')
  .description(
    [
      'TMDb person ID (Wikidataのプロパティ P4985) を手がかりに、',
      'Wikidataの日本語ラベルを映画人の日本語名として保存します。',
      '名前に日本語を含まず、日本語名の翻訳も無い人物が対象で、',
      '個人賞を持つ人物、クレジットの多い人物から順に処理します。',
    ].join('\n'),
  )
  .option('--limit <count>', '処理件数の上限', parsePositiveInteger('limit'))
  .option(
    '--batch-size <count>',
    '1回のSPARQLで引くTMDb IDの数 (デフォルト: 50)',
    parsePositiveInteger('batch-size'),
    50,
  )
  .option('--dry-run', '実際の書き込みは行わず、取得結果のみ表示', false)
  .option(
    '--throttle <ms>',
    'バッチ間の待機ミリ秒 (デフォルト: 1000)',
    parsePositiveInteger('throttle'),
    1000,
  )
  .addHelpText(
    'after',
    `
例:
  pnpm run scrapers:wikidata-japanese-names --dry-run --limit 50
  pnpm run scrapers:wikidata-japanese-names
`,
  )
  .action(
    async (options: {
      limit?: number;
      batchSize: number;
      dryRun: boolean;
      throttle: number;
    }) => {
      assertDatabaseEnvironment(environment);

      const stats = await importJapaneseNamesFromWikidata({
        environment,
        dryRun: options.dryRun,
        limit: options.limit,
        batchSize: options.batchSize,
        throttleMs: options.throttle,
      });

      if (stats.failed > 0) {
        process.exitCode = 1;
      }
    },
  );

try {
  await program.parseAsync(process.argv);
} catch (error) {
  console.error('取得処理中にエラーが発生しました:', error);
  process.exitCode = 1;
}
