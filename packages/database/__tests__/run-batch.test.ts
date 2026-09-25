import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {eq, getDatabase, runBatch} from '../src/index';
import {movies} from '../src/schema/index';
import {createD1TestDatabase, migrate} from '../src/testing';

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../migrations',
);

type Database = ReturnType<typeof getDatabase>;

const backends: Array<{
  name: string;
  open: () => Promise<{database: Database; dispose: () => Promise<void>}>;
}> = [
  {
    name: 'libsql',
    async open() {
      const directory = mkdtempSync(path.join(tmpdir(), 'shine-batch-'));
      const database = getDatabase({
        DATABASE_FILE_URL: `file:${path.join(directory, 'test.db')}`,
      });
      await migrate(database, {migrationsFolder});
      return {
        database,
        async dispose() {
          rmSync(directory, {recursive: true, force: true});
        },
      };
    },
  },
  {
    name: 'D1',
    open: async () => createD1TestDatabase({migrationsFolder}),
  },
];

describe.each(backends)('runBatch on $name', ({open}) => {
  let database: Database;
  let dispose: () => Promise<void>;

  beforeAll(async () => {
    ({database, dispose} = await open());
  }, 60_000);

  afterAll(async () => {
    await dispose?.();
  });

  it('applies every statement in order', async () => {
    await runBatch(database, [
      database.insert(movies).values({uid: 'batch-movie', year: 1999}),
      database
        .update(movies)
        .set({year: 2000})
        .where(eq(movies.uid, 'batch-movie')),
    ]);

    const row = await database
      .select({year: movies.year})
      .from(movies)
      .where(eq(movies.uid, 'batch-movie'))
      .get();
    expect(row?.year).toBe(2000);
  });

  it('rolls back every statement when one fails', async () => {
    await expect(
      runBatch(database, [
        database.insert(movies).values({uid: 'rolled-back', year: 1999}),
        database.insert(movies).values({uid: 'rolled-back', year: 1999}),
      ]),
    ).rejects.toThrow();

    const rows = await database
      .select({uid: movies.uid})
      .from(movies)
      .where(eq(movies.uid, 'rolled-back'));
    expect(rows).toEqual([]);
  });

  it('does nothing for an empty list', async () => {
    await expect(runBatch(database, [])).resolves.toBeUndefined();
  });
});
