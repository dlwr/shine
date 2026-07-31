#!/usr/bin/env -S tsx

/**
 * 日本アカデミー賞スクレイピングのCLIエントリーポイント
 */
import japanAcademyAwards from './japan-academy-awards';
import {
  assertDatabaseEnvironment,
  buildEnvironment,
  loadEnvironmentFiles,
} from './common/environment';

loadEnvironmentFiles();
const environment = buildEnvironment(process.env);
assertDatabaseEnvironment(environment);

const arguments_ = process.argv.slice(2);
const shouldSeed = arguments_.includes('--seed');
const shouldHelp = arguments_.includes('--help') || arguments_.includes('-h');
const isDryRun = arguments_.includes('--dry-run');
const yearIndex = arguments_.indexOf('--year');
const year =
  yearIndex !== -1 && yearIndex + 1 < arguments_.length
    ? arguments_[yearIndex + 1]
    : undefined;

if (shouldHelp) {
  console.log(`
Usage: japan-academy-awards-cli [options]

Options:
  --seed         Seed the database with Japan Academy Awards organization and categories
  --year YEAR    Scrape data for a specific year (e.g., --year 2023)
  --dry-run      Show what would be scraped without making database changes
  --help         Show this help message

Examples:
  # Scrape Japan Academy Awards data for all years
  japan-academy-awards-cli

  # Scrape data for a specific year
  japan-academy-awards-cli --year 2023

  # Preview what would be scraped for 2023 (dry run)
  japan-academy-awards-cli --year 2023 --dry-run

  # Seed database first, then scrape specific year
  japan-academy-awards-cli --seed --year 2023
`);
  process.exit(0);
}

try {
  if (isDryRun) {
    console.log('🔍 DRY RUN MODE - No database changes will be made');
  }

  if (shouldSeed) {
    console.log('Seeding Japan Academy Awards...');
    const seedUrl = isDryRun
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
  if (year) {
    searchParameters.append('year', year);
  }

  if (isDryRun) {
    searchParameters.append('dry-run', 'true');
  }

  const url = `${baseUrl}?${searchParameters.toString()}`;
  const request = new Request(url);
  const response = await japanAcademyAwards.fetch(request, environment);
  if (!response.ok) {
    throw new Error(`Scraping failed: ${await response.text()}`);
  }

  console.log('Scraping completed successfully');
} catch (error) {
  console.error('Error:', error);
  process.exit(1);
}
