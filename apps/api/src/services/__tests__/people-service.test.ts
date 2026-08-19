import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {movieCredits} from '@shine/database/schema/movie-credits';
import {movies} from '@shine/database/schema/movies';
import {people} from '@shine/database/schema/people';
import {posterUrls} from '@shine/database/schema/poster-urls';
import {translations} from '@shine/database/schema/translations';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {beforeEach, describe, expect, it} from 'vitest';
import {PeopleService} from '../people-service';

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

  await database.insert(movies).values([
    {uid: 'movie-ran', year: 1985},
    {uid: 'movie-kagemusha', year: 1980},
    {uid: 'movie-deleted', year: 1990, deletedAt: 1_700_000_000},
  ]);
  await database.insert(translations).values([
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-ran',
      languageCode: 'ja',
      content: '乱',
      isDefault: 1,
    },
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-kagemusha',
      languageCode: 'ja',
      content: '影武者',
      isDefault: 1,
    },
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-deleted',
      languageCode: 'ja',
      content: '消えた映画',
      isDefault: 1,
    },
  ]);
  await database.insert(posterUrls).values({
    movieUid: 'movie-ran',
    url: 'https://example.com/ran.jpg',
    isPrimary: 1,
  });
  await database.insert(people).values([
    {uid: 'person-kurosawa', tmdbId: 5026, name: '黒澤明'},
    {uid: 'person-scorsese', tmdbId: 1032, name: 'Martin Scorsese'},
  ]);
  await database.insert(translations).values({
    resourceType: 'person_name',
    resourceUid: 'person-scorsese',
    languageCode: 'ja',
    content: 'マーティン・スコセッシ',
  });
  await database.insert(movieCredits).values([
    {
      movieUid: 'movie-ran',
      personUid: 'person-kurosawa',
      creditId: 'c1',
      department: 'Directing',
      job: 'Director',
    },
    {
      movieUid: 'movie-kagemusha',
      personUid: 'person-kurosawa',
      creditId: 'c2',
      department: 'Directing',
      job: 'Director',
    },
    {
      movieUid: 'movie-deleted',
      personUid: 'person-kurosawa',
      creditId: 'c3',
      department: 'Directing',
      job: 'Director',
    },
  ]);

  return {environment, database};
}

describe('PeopleService.getPerson', () => {
  let environment: Environment;

  beforeEach(async () => {
    ({environment} = await createTestEnvironment());
  });

  it('人物名を返す', async () => {
    const service = new PeopleService(environment);

    const person = await service.getPerson('person-kurosawa', 'ja');

    expect(person?.name).toBe('黒澤明');
  });

  it('locale が ja なら日本語名を返す', async () => {
    const service = new PeopleService(environment);

    const person = await service.getPerson('person-scorsese', 'ja');

    expect(person?.name).toBe('マーティン・スコセッシ');
  });

  it('参加作品を新しい年から並べる', async () => {
    const service = new PeopleService(environment);

    const person = await service.getPerson('person-kurosawa', 'ja');

    expect(person?.credits.map(credit => credit.title)).toEqual([
      '乱',
      '影武者',
    ]);
  });

  it('論理削除された映画は含めない', async () => {
    const service = new PeopleService(environment);

    const person = await service.getPerson('person-kurosawa', 'ja');

    expect(person?.credits.map(credit => credit.title)).not.toContain(
      '消えた映画',
    );
  });

  it('役割を返す', async () => {
    const service = new PeopleService(environment);

    const person = await service.getPerson('person-kurosawa', 'ja');

    expect(person?.credits[0].job).toBe('Director');
  });

  it('存在しない人物には undefined を返す', async () => {
    const service = new PeopleService(environment);

    const person = await service.getPerson('person-missing', 'ja');

    expect(person).toBeUndefined();
  });
});
