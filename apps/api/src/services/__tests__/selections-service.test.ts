import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {translations} from '@shine/database/schema/translations';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {beforeEach, describe, expect, it} from 'vitest';
import {SelectionsService} from '../selections-service';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../../packages/database/migrations',
);

type TestDatabase = ReturnType<typeof getDatabase>;

async function createTestEnvironment(): Promise<{
  environment: Environment;
  database: TestDatabase;
}> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-test-'));
  const environment: Environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});

  await database
    .insert(awardOrganizations)
    .values({uid: 'org-1', name: 'Test Award'});
  await database
    .insert(awardCeremonies)
    .values({uid: 'ceremony-1', organizationUid: 'org-1', year: 2020});
  await database.insert(awardCategories).values({
    uid: 'category-1',
    organizationUid: 'org-1',
    name: 'Best Picture',
  });

  return {environment, database};
}

async function seedNominatedMovie(
  database: TestDatabase,
  uid: string,
  title: string,
): Promise<void> {
  await database.insert(movies).values({uid, year: 2020});
  await database.insert(translations).values({
    resourceType: 'movie_title',
    resourceUid: uid,
    languageCode: 'en',
    content: title,
    isDefault: 1,
  });
  await database.insert(nominations).values({
    movieUid: uid,
    ceremonyUid: 'ceremony-1',
    categoryUid: 'category-1',
  });
}

describe('SelectionsService.reselectMovie with excludeMovieUids', () => {
  let environment: Environment;
  let database: TestDatabase;

  beforeEach(async () => {
    ({environment, database} = await createTestEnvironment());
  });

  it('throws when every nominated movie is excluded', async () => {
    await seedNominatedMovie(database, 'movie-a', 'Movie A');
    const service = new SelectionsService(environment);

    await expect(
      service.reselectMovie('daily', 'en', new Date('2026-07-15'), ['movie-a']),
    ).rejects.toThrow('No movies available for selection');
  });

  it('never selects an excluded movie', async () => {
    await seedNominatedMovie(database, 'movie-a', 'Movie A');
    await seedNominatedMovie(database, 'movie-b', 'Movie B');
    const service = new SelectionsService(environment);

    for (let index = 0; index < 10; index++) {
      const movie = await service.reselectMovie(
        'daily',
        'en',
        new Date('2026-07-15'),
        ['movie-a'],
      );
      expect(movie.uid).toBe('movie-b');
    }
  });

  it('reselects normally when excludeMovieUids is omitted', async () => {
    await seedNominatedMovie(database, 'movie-a', 'Movie A');
    const service = new SelectionsService(environment);

    const movie = await service.reselectMovie(
      'daily',
      'en',
      new Date('2026-07-15'),
    );
    expect(movie.uid).toBe('movie-a');
  });
});
