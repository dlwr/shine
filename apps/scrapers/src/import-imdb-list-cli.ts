import {existsSync} from 'node:fs';
import path from 'node:path';
import {config as loadEnvironment} from 'dotenv';
import {Command} from 'commander';
import {importMoviesFromCsv} from './import-imdb-list';

const environmentCandidates = [
  '.env',
  '.dev.vars',
  '../.dev.vars',
  '../../.dev.vars',
];
for (const candidate of environmentCandidates) {
  const resolvedPath = path.resolve(process.cwd(), candidate);
  if (existsSync(resolvedPath)) {
    loadEnvironment({path: resolvedPath, override: false});
  }
}

const program = new Command();

program
  .name('import-imdb-list')
  .description('Import movies from an IMDb-based CSV file.')
  .argument('<csv-file>', 'Path to the CSV file exported from IMDb')
  .option('-l, --limit <number>', 'Limit number of movies to process', value =>
    Number.parseInt(value, 10),
  )
  .option(
    '-t, --throttle <number>',
    'Throttle between TMDb requests in milliseconds',
    value => Number.parseInt(value, 10),
  )
  .option('--dry-run', 'Run without writing to the database', false)
  .action(async (csvFile: string, options: Record<string, unknown>) => {
    const limit =
      typeof options.limit === 'number' && Number.isFinite(options.limit)
        ? options.limit
        : undefined;
    const throttle =
      typeof options.throttle === 'number' && Number.isFinite(options.throttle)
        ? options.throttle
        : undefined;
    const dryRun = Boolean(options.dryRun);

    const requiredEnvironment = [
      'TURSO_DATABASE_URL',
      'TURSO_AUTH_TOKEN',
      'TMDB_API_KEY',
    ] as const;
    const missingEnvironment = requiredEnvironment.filter(
      key => !process.env[key],
    );
    if (missingEnvironment.length > 0) {
      throw new Error(
        `Missing required environment variables: ${missingEnvironment.join(', ')}`,
      );
    }

    try {
      await importMoviesFromCsv({
        filePath: csvFile,
        environment: {
          TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL!,
          TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN!,
          TMDB_API_KEY: process.env.TMDB_API_KEY,
          TMDB_LEAD_ACCESS_TOKEN: process.env.TMDB_LEAD_ACCESS_TOKEN,
          OMDB_API_KEY: process.env.OMDB_API_KEY,
        },
        dryRun,
        limit,
        throttleMs: throttle,
      });
    } catch (error) {
      throw new Error(`Import failed: ${String(error)}`);
    }
  });

try {
  await program.parseAsync(process.argv);
} catch (error) {
  console.error('Unexpected failure:', error);
  process.exitCode = 1;
}
