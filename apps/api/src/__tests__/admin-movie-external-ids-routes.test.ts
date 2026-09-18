import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {eq, getDatabase, type Environment} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createJWT} from '../auth';
import {adminMovieExternalIdsRoutes} from '../routes/admin/movie-external-ids';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

const JWT_SECRET = 'test-jwt-secret';

let environment: Environment;
let database: ReturnType<typeof getDatabase>;
let authHeaders: Record<string, string>;

function createKvStub(): KVNamespace {
  return {
    async get() {
      return null;
    },
    async put() {},
    async delete() {},
  } as unknown as KVNamespace;
}

function stubTmdbSearch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/search/movie')) {
        return Response.json({
          results: [
            {
              id: 42_699,
              title: 'Yongary',
              original_title: '대괴수 용가리',
              release_date: '1967-08-13',
            },
          ],
        });
      }

      if (url.includes('/movie/42699/external_ids')) {
        return Response.json({imdb_id: 'tt0061549'});
      }

      return new Response('not found', {status: 404});
    }),
  );
}

beforeEach(async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-test-'));
  environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
    JWT_SECRET,
    TMDB_API_KEY: 'test-key',
    CACHE_KV: createKvStub(),
  } as Environment;
  database = getDatabase(environment);
  await migrate(database, {migrationsFolder});
  await database.insert(movies).values([
    {uid: 'movie-1', year: 1967},
    {uid: 'movie-deleted', year: 1967, deletedAt: 1},
  ]);
  authHeaders = {
    Authorization: `Bearer ${await createJWT(JWT_SECRET)}`,
    'Content-Type': 'application/json',
  };
  stubTmdbSearch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /movies/:id/external-id-search', () => {
  it('トークンが無ければ 401 を返す', async () => {
    const response = await adminMovieExternalIdsRoutes.request(
      '/movies/movie-1/external-id-search?query=Yongary',
      {},
      environment,
    );

    expect(response.status).toBe(401);
  });

  it('TMDb の候補を返す', async () => {
    const response = await adminMovieExternalIdsRoutes.request(
      '/movies/movie-1/external-id-search?query=Yongary',
      {headers: authHeaders},
      environment,
    );

    expect(response.status).toBe(200);
    const {results} = (await response.json()) as {
      results: Array<{tmdbId: number}>;
    };
    expect(results[0].tmdbId).toBe(42_699);
  });

  it('年が数値でなければ 400 を返す', async () => {
    const response = await adminMovieExternalIdsRoutes.request(
      '/movies/movie-1/external-id-search?query=Yongary&year=昭和42',
      {headers: authHeaders},
      environment,
    );

    expect(response.status).toBe(400);
  });

  it('件数が 1 未満なら 400 を返す', async () => {
    const response = await adminMovieExternalIdsRoutes.request(
      '/movies/movie-1/external-id-search?query=Yongary&limit=0',
      {headers: authHeaders},
      environment,
    );

    expect(response.status).toBe(400);
  });

  it('TMDb の鍵が無ければ 503 を返す', async () => {
    const response = await adminMovieExternalIdsRoutes.request(
      '/movies/movie-1/external-id-search?query=Yongary',
      {headers: authHeaders},
      {...environment, TMDB_API_KEY: ''},
    );

    expect(response.status).toBe(503);
  });

  it('映画が無ければ 404 を返す', async () => {
    const response = await adminMovieExternalIdsRoutes.request(
      '/movies/movie-missing/external-id-search?query=Yongary',
      {headers: authHeaders},
      environment,
    );

    expect(response.status).toBe(404);
  });

  it('論理削除された映画は 404 を返す', async () => {
    const response = await adminMovieExternalIdsRoutes.request(
      '/movies/movie-deleted/external-id-search?query=Yongary',
      {headers: authHeaders},
      environment,
    );

    expect(response.status).toBe(404);
  });
});

async function putImdbId(body: unknown, movieUid = 'movie-1') {
  return adminMovieExternalIdsRoutes.request(
    `/movies/${movieUid}/imdb-id`,
    {method: 'PUT', headers: authHeaders, body: JSON.stringify(body)},
    environment,
  );
}

describe('PUT /movies/:id/imdb-id', () => {
  it('トークンが無ければ 401 を返す', async () => {
    const response = await adminMovieExternalIdsRoutes.request(
      '/movies/movie-1/imdb-id',
      {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({imdbId: 'tt0061549'}),
      },
      environment,
    );

    expect(response.status).toBe(401);
  });

  it('IMDb ID を保存する', async () => {
    const response = await putImdbId({imdbId: 'tt0061549'});

    expect(response.status).toBe(200);
    const [row] = await database
      .select({imdbId: movies.imdbId})
      .from(movies)
      .where(eq(movies.uid, 'movie-1'));
    expect(row.imdbId).toBe('tt0061549');
  });

  it('tt で始まらない ID は 400 を返す', async () => {
    const response = await putImdbId({imdbId: '0061549'});

    expect(response.status).toBe(400);
  });

  it('映画が無ければ 404 を返す', async () => {
    const response = await putImdbId({imdbId: 'tt0061549'}, 'movie-missing');

    expect(response.status).toBe(404);
  });
});

function withoutTmdbKey(): Environment {
  return {...environment, TMDB_API_KEY: ''} as Environment;
}

async function postTmdbAction(
  action: 'auto-fetch-tmdb' | 'refresh-tmdb',
  movieUid = 'movie-1',
  environmentOverride = environment,
) {
  return adminMovieExternalIdsRoutes.request(
    `/movies/${movieUid}/${action}`,
    {method: 'POST', headers: authHeaders},
    environmentOverride,
  );
}

describe('POST /movies/:id/auto-fetch-tmdb', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('トークンが無ければ 401 を返す', async () => {
    const response = await adminMovieExternalIdsRoutes.request(
      '/movies/movie-1/auto-fetch-tmdb',
      {method: 'POST'},
      environment,
    );

    expect(response.status).toBe(401);
  });

  it('映画が無ければ 404 を返す', async () => {
    const response = await postTmdbAction('auto-fetch-tmdb', 'movie-missing');

    expect(response.status).toBe(404);
  });

  it('論理削除された映画は 404 を返す', async () => {
    const response = await postTmdbAction('auto-fetch-tmdb', 'movie-deleted');

    expect(response.status).toBe(404);
  });

  it('IMDb ID が無ければ 400 を返す', async () => {
    const response = await postTmdbAction('auto-fetch-tmdb');

    expect(response.status).toBe(400);
  });

  it('TMDb の鍵が無ければ 500 を返す', async () => {
    await database
      .update(movies)
      .set({imdbId: 'tt0061549'})
      .where(eq(movies.uid, 'movie-1'));

    const response = await postTmdbAction(
      'auto-fetch-tmdb',
      'movie-1',
      withoutTmdbKey(),
    );

    expect(response.status).toBe(500);
  });

  it('TMDb に該当が無ければ 404 を返す', async () => {
    await database
      .update(movies)
      .set({imdbId: 'tt9999999'})
      .where(eq(movies.uid, 'movie-1'));

    const response = await postTmdbAction('auto-fetch-tmdb');

    expect(response.status).toBe(404);
  });

  it('TMDb の取得に失敗したら理由を添えて 500 を返す', async () => {
    await database
      .update(movies)
      .set({imdbId: 'tt0061549', tmdbId: 42_699})
      .where(eq(movies.uid, 'movie-1'));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', {status: 401})),
    );

    const response = await postTmdbAction('auto-fetch-tmdb');

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: 'TMDbデータの自動取得に失敗しました',
      details: expect.stringContaining('401'),
    });
  });
});

describe('POST /movies/:id/refresh-tmdb', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('トークンが無ければ 401 を返す', async () => {
    const response = await adminMovieExternalIdsRoutes.request(
      '/movies/movie-1/refresh-tmdb',
      {method: 'POST'},
      environment,
    );

    expect(response.status).toBe(401);
  });

  it('映画が無ければ 404 を返す', async () => {
    const response = await postTmdbAction('refresh-tmdb', 'movie-missing');

    expect(response.status).toBe(404);
  });

  it('TMDb ID が無ければ 400 を返す', async () => {
    const response = await postTmdbAction('refresh-tmdb');

    expect(response.status).toBe(400);
  });

  it('TMDb の鍵が無ければ 500 を返す', async () => {
    await database
      .update(movies)
      .set({tmdbId: 42_699})
      .where(eq(movies.uid, 'movie-1'));

    const response = await postTmdbAction(
      'refresh-tmdb',
      'movie-1',
      withoutTmdbKey(),
    );

    expect(response.status).toBe(500);
  });

  it('TMDb の取得に失敗したら 500 を返す', async () => {
    await database
      .update(movies)
      .set({tmdbId: 42_699})
      .where(eq(movies.uid, 'movie-1'));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', {status: 401})),
    );

    const response = await postTmdbAction('refresh-tmdb');

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: 'Failed to refresh TMDb data',
    });
  });
});
