#!/usr/bin/env node

import {config} from 'dotenv';
import {importMoviesFromList} from './movie-import-from-list';

// .envファイルを読み込み
config({path: '../.dev.vars'});

async function main(): Promise<void> {
  const arguments_ = process.argv.slice(2);

  // --dry-runオプションをチェック
  const dryRunIndex = arguments_.indexOf('--dry-run');
  const isDryRun = dryRunIndex !== -1;
  if (isDryRun) {
    arguments_.splice(dryRunIndex, 1);
  }

  if (arguments_.length < 2) {
    console.log(
      'Usage: movie-import-from-list-cli <json-file-path> <award-name> [limit] [--dry-run]',
    );
    console.log(
      'Example: movie-import-from-list-cli ./tmp/1000_movies.json "Best 1000 Movies"',
    );
    console.log(
      'Example: movie-import-from-list-cli ./tmp/1000_movies.json "Best 1000 Movies" 5',
    );
    console.log(
      'Example: movie-import-from-list-cli ./tmp/1000_movies.json "Best 1000 Movies" --dry-run',
    );
    process.exit(1);
  }

  const filePath = arguments_[0];
  const awardName = arguments_[1];
  const limit = arguments_[2] ? Number.parseInt(arguments_[2], 10) : undefined;

  // 環境変数から設定を取得
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;
  const tmdbKey = process.env.TMDB_API_KEY;

  // 必要な環境変数をチェック
  if (!tursoUrl) {
    console.error('Error: TURSO_DATABASE_URL environment variable is required');
    process.exit(1);
  }

  if (!tursoToken) {
    console.error('Error: TURSO_AUTH_TOKEN environment variable is required');
    process.exit(1);
  }

  if (!tmdbKey) {
    console.error('Error: TMDB_API_KEY environment variable is required');
    process.exit(1);
  }

  const environment = {
    TURSO_DATABASE_URL: tursoUrl,
    TURSO_AUTH_TOKEN: tursoToken,
    TMDB_API_KEY: tmdbKey,
    TMDB_LEAD_ACCESS_TOKEN: process.env.TMDB_LEAD_ACCESS_TOKEN || '',
    OMDB_API_KEY: process.env.OMDB_API_KEY || '',
  };

  try {
    console.log(`Starting import from: ${filePath}`);
    console.log(`Award name: ${awardName}`);
    if (limit) {
      console.log(`Limit: ${limit} movies`);
    }

    console.log('---');

    await importMoviesFromList(
      filePath,
      awardName,
      'Selected Films',
      environment,
      limit,
      isDryRun,
    );

    console.log('---');
    console.log('Import completed successfully!');
  } catch (error) {
    console.error('Import failed:', error);
    process.exit(1);
  }
}

await main();
