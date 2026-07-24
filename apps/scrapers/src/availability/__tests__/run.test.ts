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
  buildSourceRunners,
  createApiClient,
  loadMovieEnsuringJapaneseTitle,
  loadMovieForCheck,
} from '../run';

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

  it('loads titles with the Japanese title first', async () => {
    const movie = await loadMovieForCheck(database, 'movie-a');

    expect(movie.uid).toBe('movie-a');
    expect(movie.titles[0]).toBe('ゴッドファーザー');
    expect(movie.titles).toContain('The Godfather');
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
    expect(movie.titles[0]).toBe('アモーレス・ペロス');
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
    expect(movie.titles[0]).toBe('Amores perros');
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
    expect(movie.titles[0]).toBe('Amores perros');
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
    expect(movie.titles[0]).toBe('アモーレス・ペロス');
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

describe('createApiClient', () => {
  const previewResponse = {
    nextDaily: {date: '2026-07-16', movie: {uid: 'movie-1', title: 'A'}},
    nextWeekly: {date: '2026-07-17', movie: {uid: 'movie-2', title: 'B'}},
    nextMonthly: {date: '2026-08-01', movie: {uid: 'movie-3', title: 'C'}},
  };

  function createFetchStub() {
    return vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/auth/login')) {
        return Response.json({token: 'jwt-token'});
      }

      const headers = new Headers(init?.headers);
      if (headers.get('authorization') !== 'Bearer jwt-token') {
        return Response.json({error: 'unauthorized'}, {status: 401});
      }

      if (url.includes('/reselect')) {
        return Response.json({type: 'daily', movie: {uid: 'movie-99'}});
      }

      if (url.includes('/admin/preview-selections')) {
        return Response.json(previewResponse);
      }

      if (url.includes('/imdb-id') && init?.method === 'PUT') {
        return Response.json({success: true});
      }

      return Response.json({error: 'not found'}, {status: 404});
    });
  }

  it('fetches next-period selections with dates', async () => {
    const fetchStub = createFetchStub();
    const client = createApiClient({
      apiUrl: 'https://api.example.com',
      adminPassword: 'secret',
      fetchImpl: fetchStub,
    });

    const selections = await client.getNextSelections();

    expect(selections.daily).toEqual({uid: 'movie-1', date: '2026-07-16'});
    expect(selections.weekly).toEqual({uid: 'movie-2', date: '2026-07-17'});
    expect(selections.monthly).toEqual({uid: 'movie-3', date: '2026-08-01'});
  });

  it('logs in once and reselects the target date with exclusions', async () => {
    const fetchStub = createFetchStub();
    const client = createApiClient({
      apiUrl: 'https://api.example.com',
      adminPassword: 'secret',
      fetchImpl: fetchStub,
    });

    const newUid = await client.reselect('daily', ['movie-1'], '2026-07-16');
    await client.reselect('daily', ['movie-1', 'movie-99'], '2026-07-16');

    expect(newUid).toBe('movie-99');
    const loginCalls = fetchStub.mock.calls.filter(([url]) =>
      (url as string).endsWith('/auth/login'),
    );
    expect(loginCalls).toHaveLength(1);
    const reselectCall = fetchStub.mock.calls.find(([url]) =>
      (url as string).includes('/reselect'),
    );
    const body = JSON.parse((reselectCall?.[1] as RequestInit).body as string);
    expect(body.excludeMovieUids).toEqual(['movie-1']);
    expect(body.type).toBe('daily');
    expect(body.date).toBe('2026-07-16');
  });

  it('refreshTmdbData PUTs the imdb-id endpoint with refreshData', async () => {
    const fetchStub = createFetchStub();
    const client = createApiClient({
      apiUrl: 'https://api.example.com',
      adminPassword: 'secret',
      fetchImpl: fetchStub,
    });

    await client.refreshTmdbData('movie-b', 'tt0245712');

    const call = fetchStub.mock.calls.find(([url]) =>
      (url as string).includes('/imdb-id'),
    );
    expect(call?.[0]).toBe(
      'https://api.example.com/admin/movies/movie-b/imdb-id',
    );
    const body = JSON.parse((call?.[1] as RequestInit).body as string);
    expect(body).toEqual({imdbId: 'tt0245712', refreshData: true});
  });

  it('refreshTmdbData throws on an HTTP error', async () => {
    const fetchStub = vi.fn(async (url: string) => {
      if (url.endsWith('/auth/login')) {
        return Response.json({token: 'jwt-token'});
      }

      return Response.json({error: 'boom'}, {status: 500});
    });
    const client = createApiClient({
      apiUrl: 'https://api.example.com',
      adminPassword: 'secret',
      fetchImpl: fetchStub,
    });

    await expect(
      client.refreshTmdbData('movie-b', 'tt0245712'),
    ).rejects.toThrow('500');
  });

  it('throws when login fails', async () => {
    const fetchStub = vi.fn(async () =>
      Response.json({error: 'bad password'}, {status: 401}),
    );
    const client = createApiClient({
      apiUrl: 'https://api.example.com',
      adminPassword: 'wrong',
      fetchImpl: fetchStub,
    });

    await expect(client.reselect('daily', [], '2026-07-16')).rejects.toThrow(
      '401',
    );
  });

  it('throws when a next selection has no movie', async () => {
    const fetchStub = vi.fn(async (url: string) => {
      if (url.endsWith('/auth/login')) {
        return Response.json({token: 'jwt-token'});
      }

      return Response.json({
        ...previewResponse,
        nextDaily: {date: '2026-07-16'},
      });
    });
    const client = createApiClient({
      apiUrl: 'https://api.example.com',
      adminPassword: 'secret',
      fetchImpl: fetchStub,
    });

    await expect(client.getNextSelections()).rejects.toThrow('daily');
  });
});

describe('buildSourceRunners', () => {
  it('does not include geo (blocked with constant HTTP 403)', () => {
    const runners = buildSourceRunners({
      environment: {TURSO_DATABASE_URL: '', TURSO_AUTH_TOKEN: ''},
    });
    expect(Object.keys(runners)).toEqual(['tmdb', 'unext', 'discas']);
  });
});
