import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {migrate} from '@shine/database/testing';
import {describe, expect, it} from 'vitest';
import {awardsRoutes} from '../routes/awards';
import {crossingsRoutes} from '../routes/crossings';
import {moviesRoutes} from '../routes/movies';
import {searchRoutes} from '../routes/search';
import {selectionsRoutes} from '../routes/selections';
import {uncrownedRoutes} from '../routes/uncrowned';
import {watchedRoutes} from '../routes/watched';
import {yearsRoutes} from '../routes/years';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

function createKv(
  puts: string[],
  onPut: (key: string) => Promise<void>,
): KVNamespace {
  return {
    async get() {
      return null;
    },
    async put(key: string) {
      puts.push(key);
      await onPut(key);
    },
  } as unknown as KVNamespace;
}

async function createTestEnvironment(
  puts: string[],
  onPut: (key: string) => Promise<void>,
): Promise<Environment> {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'shine-public-cache-'),
  );
  const environment: Environment = {
    DATABASE_FILE_URL: `file:${path.join(directory, 'test.db')}`,
    CACHE_KV: createKv(puts, onPut),
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});
  return environment;
}

describe('公開ルートのキャッシュ書き込み', () => {
  it.each([
    ['awards', '/', awardsRoutes],
    ['years', '/', yearsRoutes],
    ['crossings', '/', crossingsRoutes],
    ['uncrowned', '/', uncrownedRoutes],
    ['watched', '/lists', watchedRoutes],
    ['search', '/suggest?q=%E9%BB%92%E6%BE%A4&locale=ja', searchRoutes],
    ['movies', '/search?q=kurosawa', moviesRoutes],
    ['selections', '/selections/daily/history?locale=ja', selectionsRoutes],
  ])(
    '%s %s は KV への書き込みが終わる前に応答を返す',
    async (_name, path, routes) => {
      const puts: string[] = [];
      const put = Promise.withResolvers<void>();
      const environment = await createTestEnvironment(puts, async () => {
        await put.promise;
      });
      const background: Promise<unknown>[] = [];
      const executionContext = {
        waitUntil(promise: Promise<unknown>) {
          background.push(promise);
        },
        passThroughOnException() {},
      } as ExecutionContext;

      const outcome = await Promise.race([
        routes.request(path, {}, environment, executionContext),
        new Promise<'blocked'>(resolve => {
          setTimeout(() => resolve('blocked'), 300);
        }),
      ]);

      expect(outcome).toBeInstanceOf(Response);
      expect((outcome as Response).status).toBe(200);
      expect(background).toHaveLength(1);
      put.resolve();
      await Promise.all(background);
      expect(puts).toHaveLength(1);
    },
  );
});
