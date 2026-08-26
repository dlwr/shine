import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {beforeEach, describe, expect, it} from 'vitest';
import {getDatabase, type Environment} from '../../index';
import {movies} from '../movies';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(currentDirectory, '../../../migrations');

type TestDatabase = ReturnType<typeof getDatabase>;

async function createTestDatabase(): Promise<TestDatabase> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-movies-'));
  const environment: Environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});
  return database;
}

describe('movies の tmdb_id の一意制約', () => {
  let database: TestDatabase;

  beforeEach(async () => {
    database = await createTestDatabase();
  });

  it('同じ tmdb_id でも media_type が違えば両方入る', async () => {
    await database
      .insert(movies)
      .values({uid: 'dekalog', tmdbId: 42_699, mediaType: 'tv'});

    await expect(
      database
        .insert(movies)
        .values({uid: 'yongary', tmdbId: 42_699, mediaType: 'movie'}),
    ).resolves.not.toThrow();
  });

  it('同じ tmdb_id・同じ media_type は二重に入らない', async () => {
    await database
      .insert(movies)
      .values({uid: 'first', tmdbId: 548, mediaType: 'movie'});

    await expect(
      database
        .insert(movies)
        .values({uid: 'second', tmdbId: 548, mediaType: 'movie'}),
    ).rejects.toThrow();
  });
});
