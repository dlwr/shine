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

async function seedCredits(database: TestDatabase): Promise<void> {
  await database.insert(movies).values({uid: 'movie-a', year: 1976});
  await database.insert(translations).values({
    resourceType: 'movie_title',
    resourceUid: 'movie-a',
    languageCode: 'en',
    content: 'Taxi Driver',
    isDefault: 1,
  });
  await database.insert(people).values([
    {uid: 'person-scorsese', tmdbId: 1032, name: 'Martin Scorsese'},
    {uid: 'person-deniro', tmdbId: 380, name: 'Robert De Niro'},
    {uid: 'person-schrader', tmdbId: 3468, name: 'Paul Schrader'},
  ]);
  await database.insert(translations).values({
    resourceType: 'person_name',
    resourceUid: 'person-scorsese',
    languageCode: 'ja',
    content: 'マーティン・スコセッシ',
  });
  await database.insert(movieCredits).values([
    {
      movieUid: 'movie-a',
      personUid: 'person-deniro',
      creditId: 'cast-1',
      department: 'Acting',
      character: 'Travis Bickle',
      castOrder: 0,
    },
    {
      movieUid: 'movie-a',
      personUid: 'person-schrader',
      creditId: 'crew-2',
      department: 'Writing',
      job: 'Screenplay',
    },
    {
      movieUid: 'movie-a',
      personUid: 'person-scorsese',
      creditId: 'crew-1',
      department: 'Directing',
      job: 'Director',
    },
  ]);
}

describe('MoviesService.getMovieDetails credits', () => {
  let environment: Environment;
  let database: TestDatabase;

  beforeEach(async () => {
    ({environment, database} = await createTestEnvironment());
    await seedCredits(database);
  });

  it('出演者を出演順で返す', async () => {
    const service = new MoviesService(environment);

    const details = await service.getMovieDetails('movie-a', 'en');

    expect(details?.credits?.cast.map(member => member.name)).toEqual([
      'Robert De Niro',
    ]);
  });

  it('出演者の役名を返す', async () => {
    const service = new MoviesService(environment);

    const details = await service.getMovieDetails('movie-a', 'en');

    expect(details?.credits?.cast[0].character).toBe('Travis Bickle');
  });

  it('スタッフを監督から並べる', async () => {
    const service = new MoviesService(environment);

    const details = await service.getMovieDetails('movie-a', 'en');

    expect(details?.credits?.crew.map(member => member.job)).toEqual([
      'Director',
      'Screenplay',
    ]);
  });

  it('locale が ja なら日本語名を返す', async () => {
    const service = new MoviesService(environment);

    const details = await service.getMovieDetails('movie-a', 'ja');

    expect(details?.credits?.crew[0].name).toBe('マーティン・スコセッシ');
  });

  it('locale が en なら原語名を返す', async () => {
    const service = new MoviesService(environment);

    const details = await service.getMovieDetails('movie-a', 'en');

    expect(details?.credits?.crew[0].name).toBe('Martin Scorsese');
  });
});
