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
import {MoviesService} from '../movies-service';

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
  return {environment, database};
}

async function seedNomination(
  database: TestDatabase,
  organizationName: string,
): Promise<void> {
  await database
    .insert(awardOrganizations)
    .values({uid: 'org-1', name: organizationName});
  await database
    .insert(awardCeremonies)
    .values({uid: 'ceremony-1', organizationUid: 'org-1', year: 2020});
  await database.insert(awardCategories).values({
    uid: 'category-1',
    organizationUid: 'org-1',
    name: 'Best Picture',
  });
  await database.insert(movies).values({uid: 'movie-a', year: 2020});
  await database.insert(translations).values({
    resourceType: 'movie_title',
    resourceUid: 'movie-a',
    languageCode: 'en',
    content: 'Movie A',
    isDefault: 1,
  });
  await database.insert(nominations).values({
    movieUid: 'movie-a',
    ceremonyUid: 'ceremony-1',
    categoryUid: 'category-1',
  });
}

describe('MoviesService.getMovieDetails nominations', () => {
  let environment: Environment;
  let database: TestDatabase;

  beforeEach(async () => {
    ({environment, database} = await createTestEnvironment());
  });

  it('includes the award page slug for organizations that have one', async () => {
    await seedNomination(database, 'Academy Awards');
    const service = new MoviesService(environment);

    const details = await service.getMovieDetails('movie-a', 'en');

    expect(details?.nominations[0].organization.slug).toBe(
      'academy-best-picture',
    );
  });

  it('leaves the slug undefined for organizations without an award page', async () => {
    await seedNomination(database, 'Unknown Org');
    const service = new MoviesService(environment);

    const details = await service.getMovieDetails('movie-a', 'en');

    expect(details?.nominations[0].organization.slug).toBeUndefined();
  });
});
