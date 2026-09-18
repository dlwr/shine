import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {eq, getDatabase, type Environment} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {translations} from '@shine/database/schema/translations';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {beforeEach, describe, expect, it} from 'vitest';
import {createJWT} from '../auth';
import {adminMoviesRoutes} from '../routes/admin/movies';

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

beforeEach(async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-test-'));
  environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
    JWT_SECRET,
    CACHE_KV: createKvStub(),
  };
  database = getDatabase(environment);
  await migrate(database, {migrationsFolder});
  await database.insert(movies).values([
    {uid: 'movie-1', year: 1967, imdbId: 'tt0061549'},
    {uid: 'movie-2', year: 2001},
    {uid: 'movie-deleted', year: 1999, deletedAt: 1},
  ]);
  await database.insert(translations).values([
    {
      uid: 'translation-1',
      resourceType: 'movie_title',
      resourceUid: 'movie-1',
      languageCode: 'en',
      content: 'Yongary',
      isDefault: 1,
    },
    {
      uid: 'translation-2',
      resourceType: 'movie_title',
      resourceUid: 'movie-deleted',
      languageCode: 'en',
      content: 'Deleted Movie',
      isDefault: 1,
    },
  ]);
  authHeaders = {
    Authorization: `Bearer ${await createJWT(JWT_SECRET)}`,
    'Content-Type': 'application/json',
  };
});

describe('GET /movies', () => {
  it('トークンが無ければ 401 を返す', async () => {
    const response = await adminMoviesRoutes.request(
      '/movies',
      {},
      environment,
    );

    expect(response.status).toBe(401);
  });

  it('論理削除された映画を含めない', async () => {
    const response = await adminMoviesRoutes.request(
      '/movies',
      {headers: authHeaders},
      environment,
    );

    expect(response.status).toBe(200);
    const {movies: list} = (await response.json()) as {
      movies: Array<{uid: string}>;
    };
    expect(list.map(movie => movie.uid)).not.toContain('movie-deleted');
  });

  it('題名が無い映画は Untitled として返す', async () => {
    const response = await adminMoviesRoutes.request(
      '/movies',
      {headers: authHeaders},
      environment,
    );

    const {movies: list} = (await response.json()) as {
      movies: Array<{uid: string; title: string}>;
    };
    expect(list.find(movie => movie.uid === 'movie-2')?.title).toBe('Untitled');
  });

  it('IMDb ID があれば IMDb の URL を組み立てる', async () => {
    const response = await adminMoviesRoutes.request(
      '/movies',
      {headers: authHeaders},
      environment,
    );

    const {movies: list} = (await response.json()) as {
      movies: Array<{uid: string; imdbUrl?: string}>;
    };
    expect(list.find(movie => movie.uid === 'movie-1')?.imdbUrl).toBe(
      'https://www.imdb.com/title/tt0061549/',
    );
  });

  it('件数と総ページ数を返す', async () => {
    const response = await adminMoviesRoutes.request(
      '/movies?limit=1',
      {headers: authHeaders},
      environment,
    );

    const {pagination} = (await response.json()) as {
      pagination: {limit: number; totalCount: number; totalPages: number};
    };
    expect(pagination).toMatchObject({limit: 1, totalCount: 2, totalPages: 2});
  });

  it('題名で絞り込む', async () => {
    const response = await adminMoviesRoutes.request(
      '/movies?search=Yongary',
      {headers: authHeaders},
      environment,
    );

    const {movies: list} = (await response.json()) as {
      movies: Array<{uid: string}>;
    };
    expect(list.map(movie => movie.uid)).toStrictEqual(['movie-1']);
  });
});

describe('GET /movies/:id', () => {
  it('トークンが無ければ 401 を返す', async () => {
    const response = await adminMoviesRoutes.request(
      '/movies/movie-1',
      {},
      environment,
    );

    expect(response.status).toBe(401);
  });

  it('映画の詳細を返す', async () => {
    const response = await adminMoviesRoutes.request(
      '/movies/movie-1',
      {headers: authHeaders},
      environment,
    );

    expect(response.status).toBe(200);
    expect((await response.json()) as {uid: string}).toMatchObject({
      uid: 'movie-1',
    });
  });

  it('映画が無ければ 404 を返す', async () => {
    const response = await adminMoviesRoutes.request(
      '/movies/movie-missing',
      {headers: authHeaders},
      environment,
    );

    expect(response.status).toBe(404);
  });

  it('論理削除された映画は 404 を返す', async () => {
    const response = await adminMoviesRoutes.request(
      '/movies/movie-deleted',
      {headers: authHeaders},
      environment,
    );

    expect(response.status).toBe(404);
  });
});

describe('POST /movies', () => {
  it('トークンが無ければ 401 を返す', async () => {
    const response = await adminMoviesRoutes.request(
      '/movies',
      {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({imdbId: 'tt0000001'}),
      },
      environment,
    );

    expect(response.status).toBe(401);
  });

  it('本文が JSON でなければ 400 を返す', async () => {
    const response = await adminMoviesRoutes.request(
      '/movies',
      {method: 'POST', headers: authHeaders, body: 'not json'},
      environment,
    );

    expect(response.status).toBe(400);
  });

  it('IMDb ID が無ければ 400 を返す', async () => {
    const response = await adminMoviesRoutes.request(
      '/movies',
      {method: 'POST', headers: authHeaders, body: JSON.stringify({})},
      environment,
    );

    expect(response.status).toBe(400);
  });
});

describe('PUT /movies/:id', () => {
  it('トークンが無ければ 401 を返す', async () => {
    const response = await adminMoviesRoutes.request(
      '/movies/movie-1',
      {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({year: 1968}),
      },
      environment,
    );

    expect(response.status).toBe(401);
  });

  it('製作年を更新する', async () => {
    const response = await adminMoviesRoutes.request(
      '/movies/movie-1',
      {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({year: 1968}),
      },
      environment,
    );

    expect(response.status).toBe(200);
    const [row] = await database
      .select({year: movies.year})
      .from(movies)
      .where(eq(movies.uid, 'movie-1'));
    expect(row.year).toBe(1968);
  });

  it('映画が無ければ 404 を返す', async () => {
    const response = await adminMoviesRoutes.request(
      '/movies/movie-missing',
      {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({year: 1968}),
      },
      environment,
    );

    expect(response.status).toBe(404);
  });
});

describe('DELETE /movies/:id', () => {
  it('トークンが無ければ 401 を返す', async () => {
    const response = await adminMoviesRoutes.request(
      '/movies/movie-1',
      {method: 'DELETE'},
      environment,
    );

    expect(response.status).toBe(401);
  });

  it('映画と題名を消す', async () => {
    const response = await adminMoviesRoutes.request(
      '/movies/movie-1',
      {method: 'DELETE', headers: authHeaders},
      environment,
    );

    expect(response.status).toBe(200);
    expect(
      await database.select().from(movies).where(eq(movies.uid, 'movie-1')),
    ).toHaveLength(0);
    expect(
      await database
        .select()
        .from(translations)
        .where(eq(translations.resourceUid, 'movie-1')),
    ).toHaveLength(0);
  });
});
