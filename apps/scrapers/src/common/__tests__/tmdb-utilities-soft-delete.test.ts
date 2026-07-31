import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {getDatabase, type Environment} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {eq} from 'drizzle-orm';
import {beforeEach, describe, expect, it} from 'vitest';
import {saveTMDBId} from '../tmdb-utilities';

const MOVIES_DDL = `CREATE TABLE movies (
  uid text PRIMARY KEY,
  original_language text NOT NULL DEFAULT 'en',
  year integer,
  imdb_id text UNIQUE,
  tmdb_id integer UNIQUE,
  media_type text NOT NULL DEFAULT 'movie',
  release_date text,
  created_at integer NOT NULL DEFAULT (unixepoch()),
  updated_at integer NOT NULL DEFAULT (unixepoch()),
  deleted_at integer
)`;

describe('saveTMDBId and soft-deleted movies', () => {
  let environment: Environment;
  let database: ReturnType<typeof getDatabase>;

  beforeEach(async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'shine-test-'));
    environment = {
      TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
      TURSO_AUTH_TOKEN: '',
    } as Environment;
    database = getDatabase(environment);
    await database.run(MOVIES_DDL);
  });

  it('does not assign a TMDb ID to a soft-deleted movie', async () => {
    await database.insert(movies).values({
      uid: 'deleted-movie',
      imdbId: 'tt0000001',
      deletedAt: 1_700_000_000,
    });

    await saveTMDBId('tt0000001', 42, environment);

    const [row] = await database
      .select({tmdbId: movies.tmdbId})
      .from(movies)
      .where(eq(movies.uid, 'deleted-movie'));
    expect(row.tmdbId).toBeNull();
  });

  it('assigns a TMDb ID to an active movie', async () => {
    await database.insert(movies).values({
      uid: 'active-movie',
      imdbId: 'tt0000002',
    });

    await saveTMDBId('tt0000002', 43, environment);

    const [row] = await database
      .select({tmdbId: movies.tmdbId})
      .from(movies)
      .where(eq(movies.uid, 'active-movie'));
    expect(row.tmdbId).toBe(43);
  });
});
