import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {migrate} from '@shine/database/testing';
import {beforeEach, describe, expect, it} from 'vitest';
import {moviesRoutes} from '../routes/movies';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

function createMemoryKv(): KVNamespace {
  const store = new Map<string, string>();
  return {
    async get(key: string, type?: string | {type?: string}) {
      const raw = store.get(key);
      if (raw === undefined) {
        return null;
      }

      return type === 'json' ||
        (typeof type === 'object' && type.type === 'json')
        ? JSON.parse(raw)
        : raw;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
  } as unknown as KVNamespace;
}

async function createTestEnvironment(): Promise<Environment> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-test-'));
  const environment: Environment = {
    DATABASE_FILE_URL: `file:${path.join(directory, 'test.db')}`,
    CACHE_KV: createMemoryKv(),
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});

  await database.insert(movies).values([
    {uid: 'movie-b-1990', year: 1990},
    {uid: 'movie-a-1990', year: 1990},
    {uid: 'movie-1985', year: 1985},
    {uid: 'movie-2001', year: 2001},
    {uid: 'movie-deleted', year: 1970, deletedAt: 1},
  ]);

  return environment;
}

async function requestUids(environment: Environment) {
  const response = await moviesRoutes.request('/uids', {}, environment);
  const body = (await response.json()) as {uids: string[]};
  return {response, body};
}

describe('GET /movies/uids', () => {
  let environment: Environment;

  beforeEach(async () => {
    environment = await createTestEnvironment();
  });

  it('論理削除を除いた全映画の uid を年・uid の順で返す', async () => {
    const {response, body} = await requestUids(environment);

    expect(response.status).toBe(200);
    expect(body.uids).toEqual([
      'movie-1985',
      'movie-a-1990',
      'movie-b-1990',
      'movie-2001',
    ]);
  });

  it('2 回目は KV から返す', async () => {
    const first = await requestUids(environment);
    const second = await requestUids(environment);

    expect(first.response.headers.get('X-Cache-Status')).toBe('MISS');
    expect(second.response.headers.get('X-Cache-Status')).toBe('HIT');
    expect(second.body).toEqual(first.body);
  });

  it('1 日キャッシュする', async () => {
    const {response} = await requestUids(environment);

    expect(response.headers.get('X-Cache-TTL')).toBe('86400');
  });
});
