import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {afterEach, describe, expect, it} from 'vitest';
import {createNewMovieForBatch} from '../movie-import-from-list';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

let temporaryDirectories: string[] = [];

async function createTestContext() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-list-'));
  temporaryDirectories.push(directory);
  const environment: Environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});
  return {
    context: {
      environment,
      tmdbApiKey: 'test-key',
      tmdbConfig: undefined,
      isDryRun: false,
    },
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.map(async directory =>
      fs.rm(directory, {recursive: true, force: true}),
    ),
  );
  temporaryDirectories = [];
});

describe('createNewMovieForBatch', () => {
  it('原語が日本語なら日本語タイトルがデフォルトになる', async () => {
    const {context} = await createTestContext();

    const result = await createNewMovieForBatch(context, {
      id: 1_379_266,
      title: '国宝',
      original_title: 'Kokuho',
      original_language: 'ja',
      release_date: '2025-06-06',
      poster_path: undefined,
      imdb_id: undefined,
      overview: '',
    });

    const byLanguage = new Map(
      result.translations.map(row => [row.languageCode, row]),
    );
    expect(byLanguage.get('ja')?.isDefault).toBe(1);
    expect(byLanguage.get('en')?.isDefault).toBe(0);
  });

  it('原語が英語なら英語タイトルがデフォルトになる', async () => {
    const {context} = await createTestContext();

    const result = await createNewMovieForBatch(context, {
      id: 27_205,
      title: 'インセプション',
      original_title: 'Inception',
      original_language: 'en',
      release_date: '2010-07-15',
      poster_path: undefined,
      imdb_id: undefined,
      overview: '',
    });

    const byLanguage = new Map(
      result.translations.map(row => [row.languageCode, row]),
    );
    expect(byLanguage.get('en')?.isDefault).toBe(1);
    expect(byLanguage.get('ja')?.isDefault).toBe(0);
  });
});
