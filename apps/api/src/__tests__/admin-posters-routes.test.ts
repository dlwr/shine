import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {eq, getDatabase, type Environment} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {posterUrls} from '@shine/database/schema/poster-urls';
import {migrate} from '@shine/database/testing';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {createJWT} from '../auth';
import {adminPostersRoutes} from '../routes/admin/posters';

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

async function postersOf(movieUid: string) {
  return database
    .select({
      uid: posterUrls.uid,
      url: posterUrls.url,
      isPrimary: posterUrls.isPrimary,
      languageCode: posterUrls.languageCode,
    })
    .from(posterUrls)
    .where(eq(posterUrls.movieUid, movieUid))
    .orderBy(posterUrls.url);
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
  await database.insert(movies).values({uid: 'movie-1', year: 2020});
  await database.insert(posterUrls).values({
    uid: 'poster-a',
    movieUid: 'movie-1',
    url: 'https://example.com/a.jpg',
    isPrimary: 1,
  });
  authHeaders = {
    Authorization: `Bearer ${await createJWT(JWT_SECRET)}`,
    'Content-Type': 'application/json',
  };
});

describe('POST /movies/:id/posters', () => {
  it('トークンが無ければ 401 を返す', async () => {
    const response = await adminPostersRoutes.request(
      '/movies/movie-1/posters',
      {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({url: 'https://example.com/b.jpg'}),
      },
      environment,
    );

    expect(response.status).toBe(401);
  });

  it('URL が無ければ 400 を返す', async () => {
    const response = await adminPostersRoutes.request(
      '/movies/movie-1/posters',
      {method: 'POST', headers: authHeaders, body: JSON.stringify({})},
      environment,
    );

    expect(response.status).toBe(400);
  });

  it('URL として読めなければ 400 を返す', async () => {
    const response = await adminPostersRoutes.request(
      '/movies/movie-1/posters',
      {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({url: 'not a url'}),
      },
      environment,
    );

    expect(response.status).toBe(400);
  });

  it('ポスターを追加して保存した行を返す', async () => {
    const response = await adminPostersRoutes.request(
      '/movies/movie-1/posters',
      {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          url: 'https://example.com/b.jpg',
          languageCode: 'ja',
        }),
      },
      environment,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      url: 'https://example.com/b.jpg',
      languageCode: 'ja',
    });
    expect(await postersOf('movie-1')).toHaveLength(2);
  });

  it('isPrimary で追加すると既存の主ポスターが降りる', async () => {
    await adminPostersRoutes.request(
      '/movies/movie-1/posters',
      {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          url: 'https://example.com/b.jpg',
          isPrimary: true,
        }),
      },
      environment,
    );

    const posters = await postersOf('movie-1');
    expect(posters.map(poster => [poster.url, poster.isPrimary])).toEqual([
      ['https://example.com/a.jpg', 0],
      ['https://example.com/b.jpg', 1],
    ]);
  });
});

describe('DELETE /movies/:movieId/posters/:posterId', () => {
  it('ポスターを消す', async () => {
    const response = await adminPostersRoutes.request(
      '/movies/movie-1/posters/poster-a',
      {method: 'DELETE', headers: authHeaders},
      environment,
    );

    expect(response.status).toBe(200);
    expect(await postersOf('movie-1')).toHaveLength(0);
  });

  it('別の映画のポスターは消さない', async () => {
    const response = await adminPostersRoutes.request(
      '/movies/movie-2/posters/poster-a',
      {method: 'DELETE', headers: authHeaders},
      environment,
    );

    expect(response.status).toBe(200);
    expect(await postersOf('movie-1')).toHaveLength(1);
  });
});

describe('DELETE の認証と失敗', () => {
  it('トークンが無ければ 401 を返す', async () => {
    const response = await adminPostersRoutes.request(
      '/movies/movie-1/posters/poster-1',
      {method: 'DELETE'},
      environment,
    );

    expect(response.status).toBe(401);
  });

  it('DB が読めなければ 500 を返す', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const empty = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-test-'));
    const broken = {
      ...environment,
      TURSO_DATABASE_URL: `file:${path.join(empty, 'unmigrated.db')}`,
    } as Environment;

    const response = await adminPostersRoutes.request(
      '/movies/movie-1/posters/poster-1',
      {method: 'DELETE', headers: authHeaders},
      broken,
    );

    expect(response.status).toBe(500);
  });

  it('追加で DB が読めなければ 500 を返す', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const empty = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-test-'));
    const broken = {
      ...environment,
      TURSO_DATABASE_URL: `file:${path.join(empty, 'unmigrated.db')}`,
    } as Environment;

    const response = await adminPostersRoutes.request(
      '/movies/movie-1/posters',
      {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({url: 'https://example.com/p.jpg'}),
      },
      broken,
    );

    expect(response.status).toBe(500);
  });
});
