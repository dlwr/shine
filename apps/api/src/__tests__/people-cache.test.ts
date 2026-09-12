import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {people} from '@shine/database/schema/people';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {describe, expect, it} from 'vitest';
import {peopleRoutes} from '../routes/people';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

const PERSON_UID = '2c5d7e1a-6f3b-4a8c-9d0e-1f2a3b4c5d6e';

function createKv(puts: string[], onPut: () => Promise<void>): KVNamespace {
  return {
    async get() {
      // eslint-disable-next-line unicorn/no-null -- KVNamespace.get returns null for missing keys
      return null;
    },
    async put(key: string) {
      puts.push(key);
      await onPut();
    },
  } as unknown as KVNamespace;
}

async function createTestEnvironment(
  puts: string[],
  onPut: () => Promise<void>,
): Promise<Environment> {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'shine-person-detail-cache-'),
  );
  const environment: Environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
    CACHE_KV: createKv(puts, onPut),
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});
  await database
    .insert(people)
    .values({uid: PERSON_UID, tmdbId: 5026, name: '黒澤明'});
  return environment;
}

describe('people ルートのキャッシュ', () => {
  it.each([
    [`/${PERSON_UID}?locale=ja`, `person:${PERSON_UID}:ja:v6`],
    ['/?page=1&limit=10', 'people:list:1:10:v1'],
    ['/prominent?locale=ja&limit=5', 'people:prominent:ja:5:v13'],
    ['/search?q=%E9%BB%92%E6%BE%A4&locale=ja', 'people:search:ja:黒澤:v1'],
    ['/crossings?locale=ja', 'people:crossings:ja:v5'],
    ['/uncrowned?locale=ja', 'people:uncrowned:ja:v3'],
  ])('%s は KV への書き込みが終わる前に応答を返す', async (path, key) => {
    const puts: string[] = [];
    const put = Promise.withResolvers<void>();
    const environment = await createTestEnvironment(puts, () => put.promise);
    const background: Promise<unknown>[] = [];
    const executionContext = {
      waitUntil(promise: Promise<unknown>) {
        background.push(promise);
      },
      passThroughOnException() {},
    } as ExecutionContext;

    const outcome = await Promise.race([
      peopleRoutes.request(path, {}, environment, executionContext),
      new Promise<'blocked'>(resolve => {
        setTimeout(() => resolve('blocked'), 300);
      }),
    ]);

    expect(outcome).toBeInstanceOf(Response);
    expect(background).toHaveLength(1);
    put.resolve();
    await Promise.all(background);
    expect(puts).toEqual([key]);
  });
});
