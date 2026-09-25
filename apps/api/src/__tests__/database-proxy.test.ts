import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  createProxyDatabase,
  eq,
  queryWithColumnNames,
  runBatch,
  sql,
  type getDatabase,
} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {translations} from '@shine/database/schema/translations';
import {createD1TestDatabase} from '@shine/database/testing';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import databaseProxy from '../database-proxy';

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../packages/database/migrations',
);

const PROXY_KEY = 'test-proxy-key';

describe('database proxy', () => {
  let binding: D1Database;
  let database: ReturnType<typeof getDatabase>;
  let dispose: () => Promise<void>;

  const proxyFetch: typeof fetch = async (input, init) =>
    databaseProxy.fetch(
      new Request(input, init) as Parameters<typeof databaseProxy.fetch>[0],
      {DB: binding, PROXY_KEY},
    );

  beforeAll(async () => {
    const d1 = await createD1TestDatabase({migrationsFolder});
    ({binding, dispose} = d1);
    database = createProxyDatabase({
      url: 'https://proxy.test',
      key: PROXY_KEY,
      fetch: proxyFetch,
    });
  }, 60_000);

  afterAll(async () => {
    await dispose?.();
  });

  it('reads back a row it wrote', async () => {
    await database.insert(movies).values({uid: 'proxy-movie', year: 1999});

    const row = await database
      .select({year: movies.year})
      .from(movies)
      .where(eq(movies.uid, 'proxy-movie'))
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

  it('keeps columns that share a name', async () => {
    await database.insert(movies).values({uid: 'same-name', year: 2001});
    await database.insert(translations).values({
      uid: 'same-name-title',
      resourceType: 'movie_title',
      resourceUid: 'same-name',
      languageCode: 'ja',
      content: '同じ名前',
    });

    const row = await database
      .select({movieUid: movies.uid, translationUid: translations.uid})
      .from(movies)
      .innerJoin(translations, eq(translations.resourceUid, movies.uid))
      .where(eq(movies.uid, 'same-name'))
      .get();

    expect(row).toEqual({
      movieUid: 'same-name',
      translationUid: 'same-name-title',
    });
  });

  it('rolls back a batch when one of its writes fails', async () => {
    await expect(
      runBatch(database, [
        database.insert(movies).values({uid: 'proxy-batch', year: 1999}),
        database.insert(movies).values({uid: 'proxy-batch', year: 1999}),
      ]),
    ).rejects.toThrow();

    const rows = await database
      .select({uid: movies.uid})
      .from(movies)
      .where(eq(movies.uid, 'proxy-batch'));
    expect(rows).toEqual([]);
  });

  it('returns column names with the rows of an ad hoc query', async () => {
    await database.insert(movies).values({uid: 'columns-movie', year: 1960});

    const result = await queryWithColumnNames(
      {url: 'https://proxy.test', key: PROXY_KEY, fetch: proxyFetch},
      `SELECT uid, year FROM movies WHERE uid = 'columns-movie'`,
    );

    expect(result).toEqual({
      columns: ['uid', 'year'],
      rows: [['columns-movie', 1960]],
    });
  });

  it('returns column names even when no row matches', async () => {
    const result = await queryWithColumnNames(
      {url: 'https://proxy.test', key: PROXY_KEY, fetch: proxyFetch},
      `SELECT uid FROM movies WHERE uid = 'missing'`,
    );

    expect(result).toEqual({columns: ['uid'], rows: []});
  });

  it('refuses a request with the wrong key', async () => {
    const intruder = createProxyDatabase({
      url: 'https://proxy.test',
      key: 'wrong',
      fetch: proxyFetch,
    });

    await expect(intruder.run(sql`SELECT 1`)).rejects.toMatchObject({
      cause: {message: expect.stringMatching(/^D1 proxy 403/)},
    });
  });
});
