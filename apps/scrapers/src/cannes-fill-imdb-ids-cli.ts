/**
 * IMDb ID を持たないカンヌの出品作に、記事から引いた IMDb ID を付けるCLI
 */
import {Command, InvalidArgumentError} from 'commander';
import {fillCannesImdbIds} from './cannes-fill-imdb-ids';
import {
  assertDatabaseEnvironment,
  buildEnvironment,
  loadEnvironmentFiles,
} from './common/environment';

loadEnvironmentFiles();
const environment = buildEnvironment(process.env);

function parseYear(value: string): number {
  const year = Number(value);

  if (!Number.isSafeInteger(year) || year < 1946) {
    throw new InvalidArgumentError('yearは1946以上の整数で指定してください。');
  }

  return year;
}

const program = new Command();

program
  .name('cannes-fill-imdb-ids')
  .description(
    [
      '旧スクレイパーが IMDb ID 無しで作ったコンペティション部門の出品作に、',
      '「YYYY Cannes Film Festival」の表の記事名からWikidataで引いた IMDb ID を付けます。',
      '英題が一意に一致した作品だけを対象にし、その ID を既に別の映画が持っていれば書きません。',
    ].join('\n'),
  )
  .requiredOption('--year <year>', '対象の映画祭の開催年', parseYear)
  .option('--dry-run', '実際の書き込みは行わず、対象のみ表示', false)
  .addHelpText(
    'after',
    `
例:
  pnpm run scrapers:cannes-fill-imdb-ids --year 1951 --dry-run
  pnpm run scrapers:cannes-fill-imdb-ids --year 1951
`,
  );

program.parse();

const options = program.opts<{year: number; dryRun: boolean}>();

assertDatabaseEnvironment(environment);

await fillCannesImdbIds({
  environment,
  year: options.year,
  dryRun: options.dryRun,
});
