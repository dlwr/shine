import {Command} from 'commander';
import {assignImdbIds} from './assign-imdb-ids.js';
import {buildEnvironment, loadEnvironmentFiles} from './common/environment.js';

export function createCommand(): Command {
  return new Command()
    .name('assign-imdb-ids')
    .description(
      "Assign IMDb IDs to movies that don't have them using TMDb API",
    )
    .option('--dry-run', 'Perform a dry run without making changes')
    .option(
      '--limit <number>',
      'Limit the number of movies to process',
      Number.parseInt,
      10,
    )
    .option(
      '--year <year>',
      'Process only movies from a specific year',
      Number.parseInt,
    )
    .action(
      async (options: {dryRun?: boolean; limit?: number; year?: number}) => {
        loadEnvironmentFiles();

        await assignImdbIds({
          environment: buildEnvironment(process.env),
          dryRun: Boolean(options.dryRun),
          limit: options.limit,
          year: options.year,
        });
      },
    );
}
