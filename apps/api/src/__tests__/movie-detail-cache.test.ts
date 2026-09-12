import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {translations} from '@shine/database/schema/translations';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {beforeEach, describe, expect, it} from 'vitest';
import {moviesRoutes} from '../routes/movies';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

type Put = {key: string; expirationTtl: number | undefined};

function createKv(puts: Put[], onPut: () => Promise<void>): KVNamespace {
  const store = new Map<string, string>();
  return {
    async get(key: string) {
      const value = store.get(key);
      // eslint-disable-next-line unicorn/no-null -- KVNamespace.get returns null for missing keys
      return value === undefined ? null : JSON.parse(value);
    },
    async put(key: string, value: string, options?: {expirationTtl?: number}) {
      puts.push({key, expirationTtl: options?.expirationTtl});
      await onPut();
      store.set(key, value);
    },
  } as unknown as KVNamespace;
}

async function createTestEnvironment(
  puts: Put[],
  onPut: () => Promise<void> = async () => {},
): Promise<Environment> {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'shine-movie-detail-cache-'),
  );
  const environment: Environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
    CACHE_KV: createKv(puts, onPut),
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});
  await database.insert(movies).values({uid: 'movie-ran', year: 1985});
  await database.insert(translations).values({
    resourceType: 'movie_title',
    resourceUid: 'movie-ran',
    languageCode: 'ja',
    content: '乱',
    isDefault: 1,
  });
  return environment;
}

describe('GET /movies/:id のキャッシュ', () => {
  let puts: Put[];

  beforeEach(() => {
    puts = [];
  });

  it('MISS のとき KV に書くのは映画詳細の 1 キーだけ', async () => {
    const environment = await createTestEnvironment(puts);

    await moviesRoutes.request('/movie-ran?locale=ja', {}, environment);

    expect(puts.map(put => put.key)).toEqual(['movie:movie-ran:ja:v9']);
  });

  it('2 回目は KV から返す', async () => {
    const environment = await createTestEnvironment(puts);
    await moviesRoutes.request('/movie-ran?locale=ja', {}, environment);

    const response = await moviesRoutes.request(
      '/movie-ran?locale=ja',
      {},
      environment,
    );

    expect(response.headers.get('X-Cache-Status')).toBe('HIT');
  });
});
