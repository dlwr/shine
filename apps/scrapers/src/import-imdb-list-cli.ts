import {Command} from 'commander';
import {importMoviesFromCsv} from './import-imdb-list';
import {
  assertDatabaseEnvironment,
  buildEnvironment,
  loadEnvironmentFiles,
} from './common/environment';

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function createCommand(): Command {
  return new Command()
    .name('import-imdb-list')
    .description('Import movies from an IMDb-based CSV file.')
    .argument('<csv-file>', 'Path to the CSV file exported from IMDb')
    .option('-l, --limit <number>', 'Limit number of movies to process', Number)
    .option(
      '-t, --throttle <number>',
      'Throttle between TMDb requests in milliseconds',
      Number,
    )
    .option('--dry-run', 'Run without writing to the database', false)
    .option(
      '-o, --organization <name>',
      'Award organization name (default: env AWARD_ORGANIZATION_NAME or "1001 Movies You Must See Before You Die")',
    )
    .option(
      '-c, --category <name>',
      'Award category name (default: "Selected Films")',
    )
    .option('--ceremony <name>', 'Ceremony description / name')
    .action(async (csvFile: string, options: Record<string, unknown>) => {
      try {
        loadEnvironmentFiles();

        const limit = finiteNumber(options.limit);
        const throttle = finiteNumber(options.throttle);
        const isDryRun = Boolean(options.dryRun);
        const organizationName = optionalString(options.organization);
        const categoryName = optionalString(options.category);
        const ceremonyName = optionalString(options.ceremony);

        assertDatabaseEnvironment(buildEnvironment(process.env));
        if (!process.env.TMDB_API_KEY) {
          throw new Error(
            'Missing required environment variables: TMDB_API_KEY',
          );
        }

        try {
          await importMoviesFromCsv({
            filePath: csvFile,
            environment: buildEnvironment(process.env),
            dryRun: isDryRun,
            limit,
            throttleMs: throttle,
            organizationName,
            categoryName,
            ceremonyName,
          });
        } catch (error) {
          throw new Error(`Import failed: ${String(error)}`, {cause: error});
        }
      } catch (error) {
        console.error('Unexpected failure:', error);
        process.exitCode = 1;
      }
    });
}
