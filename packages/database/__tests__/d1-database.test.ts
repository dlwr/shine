import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {eq, getDatabase} from '../src/index';
import {createD1TestDatabase} from '../src/testing';
import {movies} from '../src/schema/index';

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../migrations',
);

describe('getDatabase with a D1 binding', () => {
  let dispose: () => Promise<void>;
  let database: ReturnType<typeof getDatabase>;

  beforeAll(async () => {
    ({database, dispose} = await createD1TestDatabase({migrationsFolder}));
  }, 60_000);

  afterAll(async () => {
    await dispose?.();
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
