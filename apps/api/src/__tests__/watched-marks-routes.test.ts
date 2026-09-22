import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {watchedMarks} from '@shine/database/schema/watched-marks';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {beforeEach, describe, expect, it} from 'vitest';
import {createJWT} from '../auth';
import {moviesRoutes} from '../routes/movies';
import {WATCHED_MARKS_PER_HOUR} from '../routes/movies/watched';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

const JWT_SECRET = 'test-jwt-secret';

type WatchedResponse = {watchedCount: number};

let environment: Environment;
let deletedKeys: string[];

function createKvStub(): KVNamespace {
  return {
    async get() {
      return null;
    },
    async put() {},
    async delete(key: string) {
      deletedKeys.push(key);
    },
  } as unknown as KVNamespace;
}

async function createTestEnvironment(): Promise<Environment> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-watched-'));
  const created: Environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
    JWT_SECRET,
    CACHE_KV: createKvStub(),
  };
  const database = getDatabase(created);
  await migrate(database, {migrationsFolder});
  await database.insert(movies).values([
    {uid: 'movie-1', year: 2020},
    {uid: 'movie-deleted', year: 2020, deletedAt: 1},
  ]);
  return created;
}

async function mark(
  movieUid = 'movie-1',
  headers: Record<string, string> = {},
): Promise<Response> {
  return moviesRoutes.request(
    `/${movieUid}/watched`,
    {method: 'POST', headers: {'x-real-ip': '203.0.113.1', ...headers}},
    environment,
  );
}

async function storedMarks() {
  return getDatabase(environment).select().from(watchedMarks);
}

describe('POST /movies/:id/watched', () => {
  beforeEach(async () => {
    deletedKeys = [];
    environment = await createTestEnvironment();
  });

  it('観た印を保存して他人の数を返す', async () => {
    const response = await mark();

    expect(response.status).toBe(201);
    expect((await response.json()) as WatchedResponse).toEqual({
      watchedCount: 1,
    });
    expect(await storedMarks()).toMatchObject([
      {movieUid: 'movie-1', submitterIp: '203.0.113.1', isOwner: false},
    ]);
  });

  it('同じ IP からの 2 回目は数えない', async () => {
    await mark();
    const response = await mark();

    expect(response.status).toBe(200);
    expect((await response.json()) as WatchedResponse).toEqual({
      watchedCount: 1,
    });
    expect(await storedMarks()).toHaveLength(1);
  });

  it('別の IP は別に数える', async () => {
    await mark();
    const response = await mark('movie-1', {'x-real-ip': '203.0.113.2'});

    expect((await response.json()) as WatchedResponse).toEqual({
      watchedCount: 2,
    });
  });

  it('管理者のトークン付きなら本人の印にして数えない', async () => {
    const response = await mark('movie-1', {
      Authorization: `Bearer ${await createJWT(JWT_SECRET)}`,
    });

    expect(response.status).toBe(201);
    expect((await response.json()) as WatchedResponse).toEqual({
      watchedCount: 0,
    });
    expect(await storedMarks()).toMatchObject([{isOwner: true}]);
  });

  it('映画が無ければ 404 を返す', async () => {
    const response = await mark('movie-missing');

    expect(response.status).toBe(404);
  });

  it('論理削除された映画は 404 を返す', async () => {
    const response = await mark('movie-deleted');

    expect(response.status).toBe(404);
  });

  it('IP ごとに 1 時間の上限を超えると 429 を返す', async () => {
    const database = getDatabase(environment);
    const others = Array.from({length: WATCHED_MARKS_PER_HOUR}, (_, index) => ({
      uid: `movie-other-${index}`,
      year: 2000,
    }));
    await database.insert(movies).values(others);
    await database.insert(watchedMarks).values(
      others.map(movie => ({
        movieUid: movie.uid,
        submitterIp: '203.0.113.1',
      })),
    );

    const response = await mark();

    expect(response.status).toBe(429);
  });

  it('保存したら映画と選出のキャッシュを消す', async () => {
    await mark();

    expect(deletedKeys.some(key => key.startsWith('movie:movie-1:'))).toBe(
      true,
    );
  });
});
