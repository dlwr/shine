import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {eq} from 'drizzle-orm';
import {getDatabase, type Environment} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {posterUrls} from '@shine/database/schema/poster-urls';
import {translations} from '@shine/database/schema/translations';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {beforeEach, describe, expect, it} from 'vitest';
import {
  saveJapaneseTranslation,
  savePosterUrls,
  saveTMDBId,
} from '../common/tmdb-utilities';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

describe('tmdb-utilities save functions (libsql integration)', () => {
  let environment: Environment;

  beforeEach(async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-test-'));
    environment = {
      TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
      TURSO_AUTH_TOKEN: '',
    };
    const database = getDatabase(environment);
    await migrate(database, {migrationsFolder});

    await database
      .insert(movies)
      .values({uid: 'movie-1', year: 2020, imdbId: 'tt0000001'});
  });

  describe('savePosterUrls', () => {
    const posters = [
      {file_path: '/a.jpg', width: 500, height: 750, iso_639_1: 'en'},
      {file_path: '/b.jpg', width: 500, height: 750, iso_639_1: undefined},
    ];

    it('saves posters with the first one marked primary', async () => {
      const savedCount = await savePosterUrls('movie-1', posters, environment);

      expect(savedCount).toBe(2);

      const database = getDatabase(environment);
      const rows = await database
        .select()
        .from(posterUrls)
        .where(eq(posterUrls.movieUid, 'movie-1'));

      expect(rows).toHaveLength(2);
      const primary = rows.find(row => row.isPrimary === 1);
      expect(primary?.url).toBe('https://image.tmdb.org/t/p/original/a.jpg');
      expect(primary?.languageCode).toBe('en');
    });

    it('skips posters whose URL already exists', async () => {
      await savePosterUrls('movie-1', posters, environment);
      const savedCount = await savePosterUrls(
        'movie-1',
        [
          ...posters,
          {file_path: '/c.jpg', width: 300, height: 450, iso_639_1: 'ja'},
        ],
        environment,
      );

      expect(savedCount).toBe(1);

      const database = getDatabase(environment);
      const rows = await database
        .select()
        .from(posterUrls)
        .where(eq(posterUrls.movieUid, 'movie-1'));
      expect(rows).toHaveLength(3);
    });

    it('returns 0 for an empty poster list', async () => {
      const savedCount = await savePosterUrls('movie-1', [], environment);
      expect(savedCount).toBe(0);
    });
  });

  describe('saveJapaneseTranslation', () => {
    it('inserts a default Japanese title translation', async () => {
      await saveJapaneseTranslation('movie-1', 'テスト映画', environment);

      const database = getDatabase(environment);
      const rows = await database
        .select()
        .from(translations)
        .where(eq(translations.resourceUid, 'movie-1'));

      expect(rows).toHaveLength(1);
      expect(rows[0].resourceType).toBe('movie_title');
      expect(rows[0].languageCode).toBe('ja');
      expect(rows[0].content).toBe('テスト映画');
      expect(rows[0].isDefault).toBe(1);
    });

    it('updates the content when a Japanese title already exists', async () => {
      await saveJapaneseTranslation('movie-1', '旧タイトル', environment);
      await saveJapaneseTranslation('movie-1', '新タイトル', environment);

      const database = getDatabase(environment);
      const rows = await database
        .select()
        .from(translations)
        .where(eq(translations.resourceUid, 'movie-1'));

      expect(rows).toHaveLength(1);
      expect(rows[0].content).toBe('新タイトル');
    });
  });

  describe('saveTMDBId', () => {
    it('saves the TMDb ID for a movie looked up by IMDb ID', async () => {
      await saveTMDBId('tt0000001', 12_345, environment);

      const database = getDatabase(environment);
      const [movie] = await database
        .select()
        .from(movies)
        .where(eq(movies.uid, 'movie-1'));

      expect(movie.tmdbId).toBe(12_345);
    });

    it('does not overwrite an existing TMDb ID', async () => {
      await saveTMDBId('tt0000001', 12_345, environment);
      await saveTMDBId('tt0000001', 99_999, environment);

      const database = getDatabase(environment);
      const [movie] = await database
        .select()
        .from(movies)
        .where(eq(movies.uid, 'movie-1'));

      expect(movie.tmdbId).toBe(12_345);
    });

    it('skips saving when another movie already uses the TMDb ID', async () => {
      const database = getDatabase(environment);
      await database
        .insert(movies)
        .values({uid: 'movie-2', year: 2021, imdbId: 'tt0000002', tmdbId: 777});

      await saveTMDBId('tt0000001', 777, environment);

      const [movie] = await database
        .select()
        .from(movies)
        .where(eq(movies.uid, 'movie-1'));
      expect(movie.tmdbId).toBeNull();
    });
  });
});
