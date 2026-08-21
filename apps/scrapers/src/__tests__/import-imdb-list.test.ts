import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {and, eq} from 'drizzle-orm';
import {getDatabase, type Environment} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {translations} from '@shine/database/schema/translations';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {afterEach, describe, expect, it} from 'vitest';
import {insertTranslations} from '../import-imdb-list';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

let temporaryDirectories: string[] = [];

async function createTestDatabase(originalLanguage: string) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-import-'));
  temporaryDirectories.push(directory);
  const environment: Environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});
  const [movie] = await database
    .insert(movies)
    .values({originalLanguage, year: 2025})
    .returning();
  return {database, movieUid: movie.uid};
}

async function titleFlags(
  database: ReturnType<typeof getDatabase>,
  movieUid: string,
): Promise<Map<string, number | null>> {
  const rows = await database
    .select()
    .from(translations)
    .where(
      and(
        eq(translations.resourceUid, movieUid),
        eq(translations.resourceType, 'movie_title'),
      ),
    );
  return new Map(rows.map(row => [row.languageCode, row.isDefault]));
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.map(async directory =>
      fs.rm(directory, {recursive: true, force: true}),
    ),
  );
  temporaryDirectories = [];
});

describe('insertTranslations', () => {
  it('原語が日本語なら日本語タイトルがデフォルトになる', async () => {
    const {database, movieUid} = await createTestDatabase('ja');

    await insertTranslations({
      database,
      movieUid,
      tmdbMovie: {
        title: '国宝',
        original_title: 'Kokuho',
        original_language: 'ja',
      },
    });

    const flags = await titleFlags(database, movieUid);
    expect(flags.get('ja')).toBe(1);
    expect(flags.get('en')).toBe(0);
  });

  it('原語が英語なら英語タイトルがデフォルトになる', async () => {
    const {database, movieUid} = await createTestDatabase('en');

    await insertTranslations({
      database,
      movieUid,
      tmdbMovie: {
        title: 'オールド・ボーイズ',
        original_title: 'Old Boys',
        original_language: 'en',
      },
    });

    const flags = await titleFlags(database, movieUid);
    expect(flags.get('en')).toBe(1);
    expect(flags.get('ja')).toBe(0);
  });
});
