/**
 * 日本語版Wikipediaの賞の記事から作品賞を取り込むCLIの共通実装
 */
import {Command, InvalidArgumentError} from 'commander';
import {type Environment} from '@shine/database';
import {type ImdbEventImportStats} from '../imdb-event-award';
import {
  assertDatabaseEnvironment,
  buildEnvironment,
  loadEnvironmentFiles,
} from './environment';

export type FilmAwardCliOptions = {
  name: string;
  description: string[];
  firstYear: number;
  /** 記事が年で区切る賞は「年」。既定は「年度」 */
  yearUnit?: string;
  importAwards: (options: {
    environment: Environment;
    dryRun?: boolean;
    year?: number;
    throttleMs?: number;
  }) => Promise<Record<string, ImdbEventImportStats>>;
};

function parseThrottle(value: string): number {
  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new InvalidArgumentError('throttleは0以上の整数で指定してください。');
  }

  return parsed;
}

export function createFilmAwardCommand({
  name,
  description,
  firstYear,
  yearUnit = '年度',
  importAwards,
}: FilmAwardCliOptions): Command {
  const parseYear = (value: string): number => {
    const parsed = Number(value);

    if (!Number.isSafeInteger(parsed) || parsed < firstYear) {
      throw new InvalidArgumentError(
        `yearは${firstYear}以上の整数で指定してください。`,
      );
    }

    return parsed;
  };

  return new Command()
    .name(name)
    .description(
      [
        ...description,
        '記事名からWikidataのIMDb ID (P345) を引いて映画を同定するため、',
        'IMDb IDを持たない作品は取り込みません。',
      ].join('\n'),
    )
    .option('--year <year>', `取り込む${yearUnit}を1つに絞る`, parseYear)
    .option('--dry-run', '実際の書き込みは行わず、取得結果のみ表示', false)
    .option('--throttle <ms>', 'TMDb呼び出し間の待機ミリ秒', parseThrottle, 300)
    .addHelpText(
      'after',
      `
例:
  pnpm scrapers ${name} --dry-run
  pnpm scrapers ${name} --year 2025
`,
    )
    .action(
      async (options: {year?: number; dryRun: boolean; throttle: number}) => {
        loadEnvironmentFiles();
        const environment = buildEnvironment(process.env);

        if (!options.dryRun) {
          assertDatabaseEnvironment(environment);
        }

        const stats = await importAwards({
          environment,
          dryRun: options.dryRun,
          year: options.year,
          throttleMs: options.throttle,
        });

        if (Object.values(stats).some(entry => entry.failed > 0)) {
          process.exitCode = 1;
        }
      },
    );
}
