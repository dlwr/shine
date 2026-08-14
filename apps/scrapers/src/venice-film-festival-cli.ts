/**
 * ヴェネツィア国際映画祭(金獅子賞)取り込みのCLIエントリーポイント
 */
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Command, InvalidArgumentError} from 'commander';
import {
  assertDatabaseEnvironment,
  buildEnvironment,
  loadEnvironmentFiles,
} from './common/environment';
import {
  importVeniceGoldenLion,
  type VeniceCollectedData,
} from './venice-film-festival';

loadEnvironmentFiles();
const environment = buildEnvironment(process.env);

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultInputPath = path.resolve(
  currentDirectory,
  '../data/venice-golden-lion.json',
);

function parseYear(value: string): number {
  const year = Number.parseInt(value, 10);

  if (Number.isNaN(year) || year < 1932 || year > new Date().getFullYear()) {
    throw new InvalidArgumentError(
      '無効な年です。1932年以降の年を指定してください。',
    );
  }

  return year;
}

function parseThrottle(value: string): number {
  const ms = Number.parseInt(value, 10);

  if (Number.isNaN(ms) || ms < 0) {
    throw new InvalidArgumentError(
      'throttleは0以上のミリ秒で指定してください。',
    );
  }

  return ms;
}

const program = new Command();

program
  .name('venice-film-festival-cli')
  .description(
    [
      'IMDbイベントページから収集済みのヴェネツィア国際映画祭データ',
      '(data/venice-golden-lion.json)を読み、金獅子賞のノミネーション・',
      '受賞情報をデータベースに保存します。',
      '映画の詳細(ポスター・邦題)はTMDbのfind APIで補完します。',
    ].join('\n'),
  )
  .option('--year <year>', '特定の年のみ処理 (例: --year 2025)', parseYear)
  .option('--input <path>', '収集データJSONのパス', defaultInputPath)
  .option('--dry-run', '実際の書き込みは行わず、処理内容のみ表示', false)
  .option(
    '--throttle <ms>',
    'TMDbリクエスト間の待機ミリ秒 (デフォルト: 300)',
    parseThrottle,
    300,
  )
  .addHelpText(
    'after',
    `
例:
  pnpm run scrapers:venice-film-festival
  pnpm run scrapers:venice-film-festival --year 2025
  pnpm run scrapers:venice-film-festival --dry-run
`,
  )
  .action(
    async (options: {
      year?: number;
      input: string;
      dryRun: boolean;
      throttle: number;
    }) => {
      console.log(
        options.year
          ? `ヴェネツィア映画祭の取り込みを開始します (対象年: ${options.year})`
          : 'ヴェネツィア映画祭の取り込みを開始します',
      );

      assertDatabaseEnvironment(environment);

      if (!environment.TMDB_API_KEY) {
        console.warn(
          '警告: TMDB_API_KEY が設定されていません。ポスター・邦題の取得がスキップされます。',
        );
      }

      const data = JSON.parse(
        readFileSync(options.input, 'utf8'),
      ) as VeniceCollectedData;

      const stats = await importVeniceGoldenLion({
        environment,
        data,
        dryRun: options.dryRun,
        year: options.year,
        throttleMs: options.throttle,
      });

      if (stats.failed > 0) {
        process.exitCode = 1;
      }

      console.log('ヴェネツィア映画祭の取り込みが完了しました');
    },
  );

try {
  await program.parseAsync(process.argv);
} catch (error) {
  console.error('取り込み処理中にエラーが発生しました:', error);
  process.exitCode = 1;
}
