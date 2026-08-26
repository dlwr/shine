import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {eq, getDatabase, type Environment} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createJWT} from '../auth';
import {adminMoviesRoutes} from '../routes/admin/movies';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

const JWT_SECRET = 'test-jwt-secret';

function createKvStub(): KVNamespace {
  const store = new Map<string, string>();
  return {
    async get(key: string) {
      const value = store.get(key);
      return value === undefined ? undefined : JSON.parse(value);
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
  } as unknown as KVNamespace;
}

function stubTmdb(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/find/tt0061549')) {
        return Response.json({
          movie_results: [{id: 42_699, media_type: 'movie'}],
          tv_results: [],
        });
      }

      if (url.includes('/movie/42699/images')) {
        return Response.json({posters: []});
      }

      if (url.includes('/movie/42699/translations')) {
        return Response.json({translations: []});
      }

      if (url.includes('/movie/42699')) {
        return Response.json({
          id: 42_699,
          title: 'Yongary, Monster from the Deep',
          original_title: '대괴수 용가리',
          original_language: 'ko',
          release_date: '1967-08-13',
        });
      }

      return new Response('not found', {status: 404});
    }),
  );
}

describe('admin movies の TMDb ID と media_type', () => {
  let environment: Environment;
  let database: ReturnType<typeof getDatabase>;
  let authHeaders: {Authorization: string; 'Content-Type': string};

  beforeEach(async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-test-'));
    environment = {
      TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
      TURSO_AUTH_TOKEN: '',
      JWT_SECRET,
      TMDB_API_KEY: 'test-key',
    } as Environment;
    environment.CACHE_KV = createKvStub();
    database = getDatabase(environment);
    await migrate(database, {migrationsFolder});
    await database
      .insert(movies)
      .values({uid: 'dekalog', tmdbId: 42_699, mediaType: 'tv', year: 1989});
    await database
      .insert(movies)
      .values({uid: 'movie-1', imdbId: 'tt0061549', year: 1967});
    authHeaders = {
      Authorization: `Bearer ${await createJWT(JWT_SECRET)}`,
      'Content-Type': 'application/json',
    };
    stubTmdb();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function tmdbIdOf(uid: string): Promise<number | null> {
    const [row] = await database
      .select({tmdbId: movies.tmdbId})
      .from(movies)
      .where(eq(movies.uid, uid));
    return row.tmdbId;
  }

  it('PUT tmdb-id は tv の作品と同じ TMDb ID を映画に設定できる', async () => {
    const response = await adminMoviesRoutes.request(
      '/movies/movie-1/tmdb-id',
      {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({tmdbId: 42_699}),
      },
      environment,
    );

    expect(response.status).toBe(200);
    expect(await tmdbIdOf('movie-1')).toBe(42_699);
  });

  it('auto-fetch-tmdb は tv の作品と同じ TMDb ID を映画に設定できる', async () => {
    const response = await adminMoviesRoutes.request(
      '/movies/movie-1/auto-fetch-tmdb',
      {method: 'POST', headers: authHeaders},
      environment,
    );

    expect(response.status).toBe(200);
    expect(await tmdbIdOf('movie-1')).toBe(42_699);
  });

  it('merge は tv の作品と同じ TMDb ID を統合先の映画に引き継ぐ', async () => {
    await database
      .insert(movies)
      .values({uid: 'source', tmdbId: 42_699, mediaType: 'movie', year: 1967});

    const response = await adminMoviesRoutes.request(
      '/movies/source/merge/movie-1',
      {method: 'POST', headers: authHeaders},
      environment,
    );

    expect(response.status).toBe(200);
    expect(await tmdbIdOf('movie-1')).toBe(42_699);
  });

  it('merge は統合元の IMDb ID を統合先に引き継ぐ', async () => {
    await database.insert(movies).values({uid: 'target', year: 1967});
    await database
      .insert(movies)
      .values({uid: 'source', imdbId: 'tt0000002', year: 1967});

    const response = await adminMoviesRoutes.request(
      '/movies/source/merge/target',
      {method: 'POST', headers: authHeaders},
      environment,
    );

    expect(response.status).toBe(200);
    const [target] = await database
      .select({imdbId: movies.imdbId})
      .from(movies)
      .where(eq(movies.uid, 'target'));
    expect(target.imdbId).toBe('tt0000002');
  });
});
