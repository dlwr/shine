/**
 * 英語版Wikipediaの受賞者一覧記事から賞を取り込むCLIの共通実装
 */
import {Command, InvalidArgumentError} from 'commander';
import {type Environment} from '@shine/database';
import {type ImdbEventImportStats} from '../imdb-event-award';
import {type EnWikipediaAward} from './en-wikipedia-award';
import {
  assertDatabaseEnvironment,
  buildEnvironment,
  loadEnvironmentFiles,
} from './environment';

export type EnWikipediaAwardCliOptions = {
  name: string;
  description: string[];
  firstYear: number;
  awards: EnWikipediaAward[];
  importAwards: (options: {
    environment: Environment;
    awards?: EnWikipediaAward[];
    dryRun?: boolean;
    year?: number;
    throttleMs?: number;
  }) => Promise<ImdbEventImportStats>;
};

function parseThrottle(value: string): number {
  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new InvalidArgumentError('throttleは0以上の整数で指定してください。');
  }

  return parsed;
}

export async function runEnWikipediaAwardCli({
  name,
  description,
  firstYear,
  awards,
  importAwards,
}: EnWikipediaAwardCliOptions): Promise<void> {
  loadEnvironmentFiles();
  const environment = buildEnvironment(process.env);

  const categories = awards.map(award => award.category);

  const parseYear = (value: string): number => {
    const parsed = Number(value);

    if (!Number.isSafeInteger(parsed) || parsed < firstYear) {
      throw new InvalidArgumentError(
        `yearは${firstYear}以上の整数で指定してください。`,
      );
    }

    return parsed;
  };

  const parseCategory = (value: string): string => {
    if (!categories.includes(value)) {
      throw new InvalidArgumentError(
        `categoryは次のいずれかで指定してください: ${categories.join(' / ')}`,
      );
    }

    return value;
  };

  const program = new Command();

  program
    .name(name)
    .description(description.join('\n'))
    .option('--year <year>', '取り込む映画祭の開催年を1つに絞る', parseYear)
    .option('--category <name>', '取り込む部門を1つに絞る', parseCategory)
    .option('--dry-run', '実際の書き込みは行わず、取得結果のみ表示', false)
    .option('--throttle <ms>', 'TMDb呼び出し間の待機ミリ秒', parseThrottle, 300)
    .addHelpText(
      'after',
      `
部門:
${categories.map(category => `  ${category}`).join('\n')}

例:
  pnpm run scrapers:${name} --dry-run
  pnpm run scrapers:${name} --year ${new Date().getFullYear()}
  pnpm run scrapers:${name} --category "${categories[0]}"
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

  const stats = await importAwards({
    environment,
    awards:
      options.category === undefined
        ? undefined
        : awards.filter(award => award.category === options.category),
    dryRun: options.dryRun,
    year: options.year,
    throttleMs: options.throttle,
  });

  if (stats.failed > 0) {
    process.exitCode = 1;
  }
}
