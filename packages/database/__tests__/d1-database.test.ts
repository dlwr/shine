import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getPlatformProxy} from 'wrangler';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {eq, getDatabase} from '../src/index';
import {migrateD1} from '../src/testing';
import {movies} from '../src/schema/index';

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../migrations',
);

describe('getDatabase with a D1 binding', () => {
  let temporaryDirectory: string;
  let dispose: () => Promise<void>;
  let database: ReturnType<typeof getDatabase>;

  beforeAll(async () => {
    temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'shine-d1-test-'));
    const configPath = path.join(temporaryDirectory, 'wrangler.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        name: 'shine-d1-test',
        compatibility_date: '2025-03-26',
        d1_databases: [
          {binding: 'DB', database_id: 'test', database_name: 'test'},
        ],
      }),
    );
    const proxy = await getPlatformProxy<{DB: D1Database}>({
      configPath,
      persist: {path: temporaryDirectory},
    });
    dispose = proxy.dispose;
    database = getDatabase({
      TURSO_DATABASE_URL: '',
      TURSO_AUTH_TOKEN: '',
      DB: proxy.env.DB,
    });
    await migrateD1(proxy.env.DB, {migrationsFolder});
  }, 60_000);

  afterAll(async () => {
    await dispose?.();
    rmSync(temporaryDirectory, {recursive: true, force: true});
  });

  it('reads back a row it wrote', async () => {
    await database.insert(movies).values({uid: 'd1-movie', year: 1999});

    const row = await database
      .select({year: movies.year})
      .from(movies)
      .where(eq(movies.uid, 'd1-movie'))
      .get();

    expect(row?.year).toBe(1999);
  });

  it('returns undefined from get when no row matches', async () => {
    const row = await database
      .select({year: movies.year})
      .from(movies)
      .where(eq(movies.uid, 'missing'))
      .get();

    expect(row).toBeUndefined();
  });
});
