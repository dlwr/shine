import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createClient} from '@libsql/client';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {getDatabase} from '../src/index';
import {movies} from '../src/schema/index';
import {migrate} from '../src/testing';

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../migrations',
);

describe('getDatabase with both a local file and a D1 proxy', () => {
  let directory: string;
  let url: string;

  beforeAll(async () => {
    directory = mkdtempSync(path.join(tmpdir(), 'shine-target-'));
    url = `file:${path.join(directory, 'test.db')}`;
    const database = getDatabase({
      DATABASE_FILE_URL: url,
      D1_PROXY_URL: 'https://proxy.invalid',
      D1_PROXY_KEY: 'key',
    });
    await migrate(database, {migrationsFolder});
    await database.insert(movies).values({uid: 'local-movie', year: 2000});
  });

  afterAll(() => {
    rmSync(directory, {recursive: true, force: true});
  });

  it('writes to the local file instead of the proxy', async () => {
    const client = createClient({url});
    try {
      const result = await client.execute(
        `SELECT uid FROM movies WHERE uid = 'local-movie'`,
      );
      expect(result.rows).toHaveLength(1);
    } finally {
      client.close();
    }
  });
});

describe('getDatabase without a D1 binding, proxy or local file', () => {
  it('refuses a remote libsql URL', () => {
    expect(() =>
      getDatabase({
        DATABASE_FILE_URL: 'libsql://example.turso.io',
      }),
    ).toThrow(/D1_PROXY_URL/);
  });
});
