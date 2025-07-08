#!/usr/bin/env -S tsx

/**
 * 日本アカデミー賞スクレイピングのCLIエントリーポイント
 */
import path from 'node:path';
import {config} from 'dotenv';
import {type Environment} from '../../src/index';
import japanAcademyAwards from './japan-academy-awards';

// 環境変数を読み込み（まずはデフォルトの場所から試行）
config();
// もしくはプロジェクトルートから明示的に読み込み
if (!process.env.TURSO_DATABASE_URL_DEV) {
	const environmentPath = path.resolve(process.cwd(), '../.env');
	config({path: environmentPath});
}

// 環境変数から設定を取得
const environment: Environment = {
	TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL_DEV || '',
	TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN_DEV || '',
	TMDB_API_KEY: process.env.TMDB_API_KEY || '',
	TMDB_LEAD_ACCESS_TOKEN: process.env.TMDB_LEAD_ACCESS_TOKEN || '',
	OMDB_API_KEY: process.env.OMDB_API_KEY || '',
	ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '',
	JWT_SECRET: process.env.JWT_SECRET || '',
};

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
		await japanAcademyAwards.fetch(seedRequest, environment);
		console.log('Seeding completed successfully');
	}

	console.log('Starting Japan Academy Awards scraping...');
	const baseUrl = 'http://localhost/';
	const searchParameters = new URLSearchParams();
	if (year) searchParameters.append('year', year);
	if (isDryRun) searchParameters.append('dry-run', 'true');
	const url = `${baseUrl}?${searchParameters.toString()}`;
	const request = new Request(url);
	await japanAcademyAwards.fetch(request, environment);
	console.log('Scraping completed successfully');
} catch (error) {
	console.error('Error:', error);
	process.exit(1);
}
