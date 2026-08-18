/**
 * Wikidataから日本語タイトルを取得するCLI
 */
import {Command, InvalidArgumentError} from 'commander';
import {
  assertDatabaseEnvironment,
  buildEnvironment,
  loadEnvironmentFiles,
} from './common/environment';
import {importJapaneseTitlesFromWikidata} from './wikidata-japanese-titles';

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
  .name('wikidata-japanese-titles')
  .description(
    [
      'IMDb ID (Wikidataのプロパティ P345) を手がかりに、',
      'Wikidataの日本語ラベルを邦題として保存します。',
      '邦題が無い映画に加えて、原題がそのまま ja として',
      '保存されている映画も対象にします。',
    ].join('\n'),
  )
  .option('--limit <count>', '処理件数の上限', parsePositiveInteger('limit'))
  .option(
    '--batch-size <count>',
    '1回のSPARQLで引くIMDb IDの数 (デフォルト: 50)',
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
  pnpm run scrapers:wikidata-japanese-titles --dry-run --limit 50
  pnpm run scrapers:wikidata-japanese-titles
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

      const stats = await importJapaneseTitlesFromWikidata({
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
