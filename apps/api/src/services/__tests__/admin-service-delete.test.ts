import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {eq, getDatabase, type Environment} from '@shine/database';
import {movieAvailabilityChecks} from '@shine/database/schema/movie-availability-checks';
import {movies} from '@shine/database/schema/movies';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {beforeEach, describe, expect, it} from 'vitest';
import {AdminService} from '../admin-service';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../../packages/database/migrations',
);

describe('AdminService.deleteMovie', () => {
  let environment: Environment;
  let database: ReturnType<typeof getDatabase>;

  beforeEach(async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-test-'));
    environment = {
      TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
      TURSO_AUTH_TOKEN: '',
    };
    database = getDatabase(environment);
    await migrate(database, {migrationsFolder});
  });

  it('deletes availability check records together with the movie', async () => {
    await database.insert(movies).values({uid: 'movie-a', year: 2020});
    await database.insert(movieAvailabilityChecks).values({
      movieUid: 'movie-a',
      source: 'tmdb',
      status: 'ok',
    });

    const service = new AdminService(environment);
    await service.deleteMovie('movie-a');

    const remainingMovies = await database
      .select()
      .from(movies)
      .where(eq(movies.uid, 'movie-a'));
    expect(remainingMovies).toHaveLength(0);

    const remainingChecks = await database
      .select()
      .from(movieAvailabilityChecks)
      .where(eq(movieAvailabilityChecks.movieUid, 'movie-a'));
    expect(remainingChecks).toHaveLength(0);
  });
});
