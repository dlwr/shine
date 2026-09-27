import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {translations} from '@shine/database/schema/translations';
import {migrate} from '@shine/database/testing';
import {describe, expect, it} from 'vitest';
import {moviesRoutes} from '../routes/movies';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

function createKv(accessedKeys: string[]): KVNamespace {
  return {
    async get(key: string) {
      accessedKeys.push(key);
      return null;
    },
    async put(key: string) {
      accessedKeys.push(key);
    },
  } as unknown as KVNamespace;
}

async function createTestEnvironment(
  accessedKeys: string[],
): Promise<Environment> {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'shine-movie-detail-cache-'),
  );
  const environment: Environment = {
    DATABASE_FILE_URL: `file:${path.join(directory, 'test.db')}`,
    CACHE_KV: createKv(accessedKeys),
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
  it('KV を読まずに D1 から返す', async () => {
    const accessedKeys: string[] = [];
    const environment = await createTestEnvironment(accessedKeys);

    const response = await moviesRoutes.request(
      '/movie-ran?locale=ja',
      {},
      environment,
    );

    expect(response.status).toBe(200);
    expect(accessedKeys).toEqual([]);
  });
});
