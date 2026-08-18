/**
 * ポスターが無い映画にTMDbからポスターを補完するCLI
 */
import {Command, InvalidArgumentError} from 'commander';
import {backfillPosters} from './backfill-posters';
import {
  assertDatabaseEnvironment,
  buildEnvironment,
  loadEnvironmentFiles,
} from './common/environment';

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
  .name('backfill-posters')
  .description(
    [
      'ポスターが登録されていない映画を対象に、TMDbからポスターを補完します。',
      'TMDb IDが無い映画はIMDb IDから、それも無ければタイトルと公開年の',
      '厳格な一致で解決します（一致しない場合は何も書き込みません）。',
    ].join('\n'),
  )
  .option('--limit <count>', '処理件数の上限', parsePositiveInteger('limit'))
  .option('--dry-run', '実際の書き込みは行わず、処理内容のみ表示', false)
  .option(
    '--throttle <ms>',
    'TMDbリクエスト間の待機ミリ秒 (デフォルト: 300)',
    parsePositiveInteger('throttle'),
    300,
  )
  .addHelpText(
    'after',
    `
例:
  pnpm run scrapers:backfill-posters --dry-run
  pnpm run scrapers:backfill-posters --limit 20
  pnpm run scrapers:backfill-posters
`,
  )
  .action(
    async (options: {limit?: number; dryRun: boolean; throttle: number}) => {
      assertDatabaseEnvironment(environment);

      if (!environment.TMDB_API_KEY) {
        console.error('TMDB_API_KEY が設定されていません。');
        process.exitCode = 1;
        return;
      }

      const stats = await backfillPosters({
        environment,
        dryRun: options.dryRun,
        limit: options.limit,
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
  console.error('ポスター補完中にエラーが発生しました:', error);
  process.exitCode = 1;
}
