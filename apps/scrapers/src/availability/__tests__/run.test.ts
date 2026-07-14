import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {translations} from '@shine/database/schema/translations';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {createApiClient, loadMovieForCheck} from '../run';

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
