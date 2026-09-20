import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {eq, getDatabase, type Environment} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {translations} from '@shine/database/schema/translations';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {movieAvailabilityChecks} from '@shine/database/schema/movie-availability-checks';
import {
  loadMovieEnsuringJapaneseTitle,
  loadMovieForCheck,
} from '../movie-for-check';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../../packages/database/migrations',
);

describe('loadMovieForCheck', () => {
  let database: ReturnType<typeof getDatabase>;

  beforeEach(async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-test-'));
    const environment: Environment = {
      TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
      TURSO_AUTH_TOKEN: '',
    };
    database = getDatabase(environment);
    await migrate(database, {migrationsFolder});
    await database.insert(movies).values({
      uid: 'movie-a',
      year: 1972,
      imdbId: 'tt0068646',
      tmdbId: 238,
    });
    await database.insert(translations).values([
      {
        resourceType: 'movie_title',
        resourceUid: 'movie-a',
        languageCode: 'en',
        content: 'The Godfather',
      },
      {
        resourceType: 'movie_title',
        resourceUid: 'movie-a',
        languageCode: 'ja',
        content: 'ゴッドファーザー',
      },
    ]);
  });

  it('loads only Japanese-language titles for the catalog search', async () => {
    const movie = await loadMovieForCheck(database, 'movie-a');

    expect(movie.uid).toBe('movie-a');
    expect(movie.japaneseTitles).toEqual(['ゴッドファーザー']);
    expect(movie.displayTitle).toBe('ゴッドファーザー');
    expect(movie.tmdbId).toBe(238);
    expect(movie.imdbId).toBe('tt0068646');
    expect(movie.year).toBe(1972);
  });

  it('throws for an unknown movie', async () => {
    await expect(loadMovieForCheck(database, 'missing')).rejects.toThrow(
      'missing',
    );
  });

  it('reports hasJapaneseTitle=true when a ja translation exists', async () => {
    const movie = await loadMovieForCheck(database, 'movie-a');

    expect(movie.hasJapaneseTitle).toBe(true);
  });

  it('reports hasJapaneseTitle=false when no ja translation exists', async () => {
    await database.insert(movies).values({
      uid: 'movie-b',
      year: 2000,
      imdbId: 'tt0245712',
    });
    await database.insert(translations).values({
      resourceType: 'movie_title',
      resourceUid: 'movie-b',
      languageCode: 'en',
      content: 'Amores perros',
    });

    const movie = await loadMovieForCheck(database, 'movie-b');

    expect(movie.hasJapaneseTitle).toBe(false);
  });

  it('reports hasJapaneseTitle=false when the ja translation has no Japanese script', async () => {
    await database.insert(movies).values({
      uid: 'movie-c',
      year: 2000,
      imdbId: 'tt0245712',
    });
    await database.insert(translations).values({
      resourceType: 'movie_title',
      resourceUid: 'movie-c',
      languageCode: 'ja',
      content: 'Amores perros',
    });

    const movie = await loadMovieForCheck(database, 'movie-c');

    expect(movie.hasJapaneseTitle).toBe(false);
  });
});

describe('loadMovieEnsuringJapaneseTitle', () => {
  let database: ReturnType<typeof getDatabase>;

  beforeEach(async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-test-'));
    const environment: Environment = {
      TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
      TURSO_AUTH_TOKEN: '',
    };
    database = getDatabase(environment);
    await migrate(database, {migrationsFolder});
    await database.insert(movies).values({
      uid: 'movie-b',
      year: 2000,
      imdbId: 'tt0245712',
    });
    await database.insert(translations).values({
      resourceType: 'movie_title',
      resourceUid: 'movie-b',
      languageCode: 'en',
      content: 'Amores perros',
    });
  });

  it('refreshes TMDb data and reloads when the Japanese title is missing', async () => {
    await database.insert(movieAvailabilityChecks).values([
      {movieUid: 'movie-b', source: 'discas', status: 'ng', checkedAt: 100},
      {movieUid: 'movie-b', source: 'tmdb', status: 'ok', checkedAt: 100},
    ]);
    const refreshTmdbData = vi.fn(async () => {
      await database.insert(translations).values({
        resourceType: 'movie_title',
        resourceUid: 'movie-b',
        languageCode: 'ja',
        content: 'アモーレス・ペロス',
      });
    });

    const movie = await loadMovieEnsuringJapaneseTitle(database, 'movie-b', {
      refreshTmdbData,
    });

    expect(refreshTmdbData).toHaveBeenCalledWith('movie-b', 'tt0245712');
    expect(movie.japaneseTitles[0]).toBe('アモーレス・ペロス');
    expect(movie.fetchedJapaneseTitle).toBe('アモーレス・ペロス');
    expect(movie.japaneseTitleMissing).toBeUndefined();
    const cacheRows = await database.select().from(movieAvailabilityChecks);
    expect(cacheRows).toHaveLength(1);
    expect(cacheRows[0].status).toBe('ok');
  });

  it('marks japaneseTitleMissing when TMDb has no Japanese title', async () => {
    const refreshTmdbData = vi.fn(async () => {
      // 何も追加されない = TMDbに日本語タイトルなし
    });

    const movie = await loadMovieEnsuringJapaneseTitle(database, 'movie-b', {
      refreshTmdbData,
    });

    expect(movie.japaneseTitleMissing).toBe(true);
    expect(movie.fetchedJapaneseTitle).toBeUndefined();
    expect(movie.japaneseTitles).toEqual([]);
    expect(movie.displayTitle).toBe('Amores perros');
  });

  it('marks japaneseTitleMissing without calling the API when imdbId is absent', async () => {
    await database.insert(movies).values({uid: 'movie-c'});
    await database.insert(translations).values({
      resourceType: 'movie_title',
      resourceUid: 'movie-c',
      languageCode: 'en',
      content: 'No IMDb Movie',
    });
    const refreshTmdbData = vi.fn(async () => {});

    const movie = await loadMovieEnsuringJapaneseTitle(database, 'movie-c', {
      refreshTmdbData,
    });

    expect(refreshTmdbData).not.toHaveBeenCalled();
    expect(movie.japaneseTitleMissing).toBe(true);
  });

  it('marks japaneseTitleMissing when the refresh call fails', async () => {
    const refreshTmdbData = vi.fn(async () => {
      throw new Error('HTTP 500');
    });

    const movie = await loadMovieEnsuringJapaneseTitle(database, 'movie-b', {
      refreshTmdbData,
    });

    expect(movie.japaneseTitleMissing).toBe(true);
    expect(movie.japaneseTitles).toEqual([]);
    expect(movie.displayTitle).toBe('Amores perros');
  });

  it('overwrites a non-Japanese ja translation using the fetched TMDb title', async () => {
    await database.insert(translations).values({
      resourceType: 'movie_title',
      resourceUid: 'movie-b',
      languageCode: 'ja',
      content: 'Amores perros',
    });
    await database.insert(movieAvailabilityChecks).values({
      movieUid: 'movie-b',
      source: 'discas',
      status: 'ng',
      checkedAt: 100,
    });
    const refreshTmdbData = vi.fn(async () => {
      // 管理APIは既存のja行をスキップするので何も変わらない
    });
    const fetchJapaneseTitle = vi.fn(async () => 'アモーレス・ペロス');
    const saveJapaneseTitle = vi.fn(async (_uid: string, title: string) => {
      await database
        .update(translations)
        .set({content: title})
        .where(eq(translations.languageCode, 'ja'));
    });

    const movie = await loadMovieEnsuringJapaneseTitle(database, 'movie-b', {
      refreshTmdbData,
      fetchJapaneseTitle,
      saveJapaneseTitle,
    });

    expect(saveJapaneseTitle).toHaveBeenCalledWith(
      'movie-b',
      'アモーレス・ペロス',
    );
    expect(movie.japaneseTitles[0]).toBe('アモーレス・ペロス');
    expect(movie.fetchedJapaneseTitle).toBe('アモーレス・ペロス');
    const cacheRows = await database.select().from(movieAvailabilityChecks);
    expect(cacheRows).toHaveLength(0);
  });

  it('does not save a fetched title that has no Japanese script', async () => {
    const refreshTmdbData = vi.fn(async () => {});
    const fetchJapaneseTitle = vi.fn(async () => 'Amores perros');
    const saveJapaneseTitle = vi.fn(async () => {});

    const movie = await loadMovieEnsuringJapaneseTitle(database, 'movie-b', {
      refreshTmdbData,
      fetchJapaneseTitle,
      saveJapaneseTitle,
    });

    expect(saveJapaneseTitle).not.toHaveBeenCalled();
    expect(movie.japaneseTitleMissing).toBe(true);
  });

  it('does not call the API when a Japanese title already exists', async () => {
    await database.insert(translations).values({
      resourceType: 'movie_title',
      resourceUid: 'movie-b',
      languageCode: 'ja',
      content: 'アモーレス・ペロス',
    });
    const refreshTmdbData = vi.fn(async () => {});

    const movie = await loadMovieEnsuringJapaneseTitle(database, 'movie-b', {
      refreshTmdbData,
    });

    expect(refreshTmdbData).not.toHaveBeenCalled();
    expect(movie.fetchedJapaneseTitle).toBeUndefined();
    expect(movie.japaneseTitleMissing).toBeUndefined();
  });
});
