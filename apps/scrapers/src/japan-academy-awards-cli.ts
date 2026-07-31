#!/usr/bin/env -S tsx

/**
 * 日本アカデミー賞スクレイピングのCLIエントリーポイント
 */
import {Command} from 'commander';
import japanAcademyAwards from './japan-academy-awards';
import {
  assertDatabaseEnvironment,
  buildEnvironment,
  loadEnvironmentFiles,
} from './common/environment';

loadEnvironmentFiles();
const environment = buildEnvironment(process.env);
assertDatabaseEnvironment(environment);

const program = new Command();

program
  .name('japan-academy-awards-cli')
  .description('Scrape Japan Academy Awards data from Wikipedia')
  .option(
    '--seed',
    'Seed the database with Japan Academy Awards organization and categories',
    false,
  )
  .option(
    '--year <year>',
    'Scrape data for a specific year (e.g., --year 2023)',
  )
  .option(
    '--dry-run',
    'Show what would be scraped without making database changes',
    false,
  )
  .addHelpText(
    'after',
    `
Examples:
  # Scrape Japan Academy Awards data for all years
  japan-academy-awards-cli

  # Scrape data for a specific year
  japan-academy-awards-cli --year 2023

  # Preview what would be scraped for 2023 (dry run)
  japan-academy-awards-cli --year 2023 --dry-run

  # Seed database first, then scrape specific year
  japan-academy-awards-cli --seed --year 2023
`,
  )
  .action(async (options: {seed: boolean; year?: string; dryRun: boolean}) => {
    if (options.dryRun) {
      console.log('🔍 DRY RUN MODE - No database changes will be made');
    }

    if (options.seed) {
      console.log('Seeding Japan Academy Awards...');
      const seedUrl = options.dryRun
        ? 'http://localhost/seed?dry-run=true'
        : 'http://localhost/seed';
      const seedRequest = new Request(seedUrl);
      const seedResponse = await japanAcademyAwards.fetch(
        seedRequest,
        environment,
      );
      if (!seedResponse.ok) {
        throw new Error(`Seeding failed: ${await seedResponse.text()}`);
      }

      console.log('Seeding completed successfully');
    }

    console.log('Starting Japan Academy Awards scraping...');
    const baseUrl = 'http://localhost/';
    const searchParameters = new URLSearchParams();
    if (options.year) {
      searchParameters.append('year', options.year);
    }

    if (options.dryRun) {
      searchParameters.append('dry-run', 'true');
    }

    const url = `${baseUrl}?${searchParameters.toString()}`;
    const request = new Request(url);
    const response = await japanAcademyAwards.fetch(request, environment);
    if (!response.ok) {
      throw new Error(`Scraping failed: ${await response.text()}`);
    }

    console.log('Scraping completed successfully');
  });

try {
  await program.parseAsync(process.argv);
} catch (error) {
  console.error('Error:', error);
  process.exitCode = 1;
}
