import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {movieCredits} from '@shine/database/schema/movie-credits';
import {movies} from '@shine/database/schema/movies';
import {people} from '@shine/database/schema/people';
import {translations} from '@shine/database/schema/translations';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {beforeEach, describe, expect, it} from 'vitest';
import {moviesRoutes} from '../routes/movies';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

type CreditsResponse = {
  credits?: {
    cast: Array<{name: string; character?: string}>;
    crew: Array<{name: string; job: string}>;
  };
};

async function createTestEnvironment(): Promise<Environment> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-test-'));
  const environment: Environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});

  await database.insert(movies).values({uid: 'movie-a', year: 2021});
  await database.insert(translations).values({
    resourceType: 'movie_title',
    resourceUid: 'movie-a',
    languageCode: 'ja',
    content: 'ドライブ・マイ・カー',
    isDefault: 1,
  });
  await database
    .insert(people)
    .values({uid: 'person-a', tmdbId: 1_346_545, name: '濱口竜介'});
  await database.insert(movieCredits).values({
    movieUid: 'movie-a',
    personUid: 'person-a',
    creditId: 'crew-1',
    department: 'Directing',
    job: 'Director',
  });

  return environment;
}

describe('GET /movies/:id credits', () => {
  let environment: Environment;

  beforeEach(async () => {
    environment = await createTestEnvironment();
  });

  it('レスポンスにクレジットを含める', async () => {
    const response = await moviesRoutes.request('/movie-a', {}, environment);

    const body = (await response.json()) as CreditsResponse;
    expect(body.credits?.crew.map(member => member.name)).toEqual(['濱口竜介']);
  });
});
