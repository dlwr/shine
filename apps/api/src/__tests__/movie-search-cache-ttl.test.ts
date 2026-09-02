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

function createRecordingKv(puts: Put[]): KVNamespace {
  return {
    async get() {
      // eslint-disable-next-line unicorn/no-null -- KVNamespace.get returns null for missing keys
      return null;
    },
    async put(key: string, _value: string, options?: {expirationTtl?: number}) {
      puts.push({key, expirationTtl: options?.expirationTtl});
    },
  } as unknown as KVNamespace;
}

async function createTestEnvironment(puts: Put[]): Promise<Environment> {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'shine-search-ttl-'),
  );
  const environment: Environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
    CACHE_KV: createRecordingKv(puts),
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

describe('GET /movies/search のキャッシュ TTL', () => {
  let environment: Environment;
  let puts: Put[];

  beforeEach(async () => {
    puts = [];
    environment = await createTestEnvironment(puts);
  });

  it('検索語ありの結果を 24 時間キャッシュする', async () => {
    await moviesRoutes.request('/search?q=%E4%B9%B1', {}, environment);

    expect(puts.map(put => put.expirationTtl)).toEqual([86_400]);
  });

  it('検索語なしの結果を 24 時間キャッシュする', async () => {
    await moviesRoutes.request('/search', {}, environment);

    expect(puts.map(put => put.expirationTtl)).toEqual([86_400]);
  });
});
