import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movieCredits} from '@shine/database/schema/movie-credits';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {people} from '@shine/database/schema/people';
import {migrate} from '@shine/database/testing';
import {afterEach, describe, expect, it} from 'vitest';
import {getScrapeDatabase} from '../common/dry-run';
import {backfillPersonBirthdays} from '../person-birthdays';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

let temporaryDirectories: string[] = [];

type TestDatabase = ReturnType<typeof getDatabase>;

async function createTestDatabase(): Promise<{
  database: TestDatabase;
  environment: Environment;
}> {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'shine-person-birthdays-'),
  );
  temporaryDirectories.push(directory);
  const environment: Environment = {
    DATABASE_FILE_URL: `file:${path.join(directory, 'test.db')}`,
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});

  await database
    .insert(movies)
    .values(['a', 'b', 'c', 'd'].map(suffix => ({uid: `movie-${suffix}`})));
  await database.insert(people).values([
    {uid: 'person-few', tmdbId: 1, name: 'Few Credits'},
    {uid: 'person-many', tmdbId: 2, name: 'Many Credits'},
    {uid: 'person-more', tmdbId: 3, name: 'More Credits'},
    {uid: 'person-nominated', tmdbId: 4, name: 'Nominated'},
    {uid: 'person-known', tmdbId: 5, name: 'Known', birthday: '1950-01-01'},
  ]);
  await database
    .insert(movieCredits)
    .values([
      ...credits('person-few', ['a', 'b']),
      ...credits('person-many', ['a', 'b', 'c']),
      ...credits('person-more', ['a', 'b', 'c', 'd']),
      ...credits('person-known', ['a', 'b', 'c', 'd']),
    ]);
  await database
    .insert(awardOrganizations)
    .values({uid: 'org', name: 'Academy Awards'});
  await database
    .insert(awardCeremonies)
    .values({uid: 'ceremony', organizationUid: 'org', year: 2000});
  await database
    .insert(awardCategories)
    .values({uid: 'category', organizationUid: 'org', name: 'Best Director'});
  await database.insert(nominations).values({
    movieUid: 'movie-a',
    ceremonyUid: 'ceremony',
    categoryUid: 'category',
    personUid: 'person-nominated',
  });

  return {database, environment};
}

function credits(personUid: string, movieSuffixes: string[]) {
  return movieSuffixes.map(suffix => ({
    movieUid: `movie-${suffix}`,
    personUid,
    creditId: `${personUid}-${suffix}`,
    department: 'Acting',
    job: 'Actor',
  }));
}

function birthdays(values: Record<number, string | undefined>) {
  const requested: number[] = [];
  return {
    requested,
    async fetchBirthday(tmdbId: number) {
      requested.push(tmdbId);
      return values[tmdbId];
    },
  };
}

async function storedBirthdays(database: TestDatabase) {
  const rows = await database
    .select({uid: people.uid, birthday: people.birthday})
    .from(people)
    .orderBy(people.uid);
  return Object.fromEntries(rows.map(row => [row.uid, row.birthday]));
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.map(async directory =>
      fs.rm(directory, {recursive: true, force: true}),
    ),
  );
  temporaryDirectories = [];
});

describe('backfillPersonBirthdays', () => {
  it('誕生日の無い人物のうち、個人賞の候補か参加作が 3 本以上の人物を、候補・参加作の多い順に引く', async () => {
    const {database} = await createTestDatabase();
    const source = birthdays({});

    await backfillPersonBirthdays({
      database,
      isDryRun: false,
      fetchBirthday: source.fetchBirthday,
    });

    expect(source.requested).toEqual([4, 3, 2]);
  });

  it('TMDb の誕生日を保存する', async () => {
    const {database} = await createTestDatabase();
    const source = birthdays({3: '1942-11-17', 4: '1910-03-23'});

    const stats = await backfillPersonBirthdays({
      database,
      isDryRun: false,
      fetchBirthday: source.fetchBirthday,
      batchSize: 1,
    });

    expect(await storedBirthdays(database)).toEqual({
      'person-few': null,
      'person-known': '1950-01-01',
      'person-many': null,
      'person-more': '1942-11-17',
      'person-nominated': '1910-03-23',
    });
    expect(stats).toMatchObject({candidates: 3, saved: 2, missing: 1});
  });

  it('YYYY-MM-DD でない値は保存しない', async () => {
    const {database} = await createTestDatabase();
    const source = birthdays({4: '1910'});

    const stats = await backfillPersonBirthdays({
      database,
      isDryRun: false,
      fetchBirthday: source.fetchBirthday,
    });

    const stored = await storedBirthdays(database);
    expect(stored['person-nominated']).toBeNull();
    expect(stats.missing).toBe(3);
  });

  it('取得で例外が出ても失敗に数えて次へ進む', async () => {
    const {database} = await createTestDatabase();

    const stats = await backfillPersonBirthdays({
      database,
      isDryRun: false,
      async fetchBirthday(tmdbId) {
        if (tmdbId === 4) {
          throw new Error('TMDb unavailable');
        }

        return '1942-11-17';
      },
    });

    expect(stats).toMatchObject({saved: 2, failed: 1});
  });

  it('dry-run では保存しない', async () => {
    const {database, environment} = await createTestDatabase();
    const source = birthdays({4: '1910-03-23'});

    const stats = await backfillPersonBirthdays({
      database: getScrapeDatabase({environment, isDryRun: true}),
      isDryRun: true,
      fetchBirthday: source.fetchBirthday,
    });

    const stored = await storedBirthdays(database);
    expect(stored['person-nominated']).toBeNull();
    expect(stats.saved).toBe(1);
  });

  it('limit で件数を絞る', async () => {
    const {database} = await createTestDatabase();
    const source = birthdays({});

    await backfillPersonBirthdays({
      database,
      isDryRun: false,
      fetchBirthday: source.fetchBirthday,
      limit: 1,
    });

    expect(source.requested).toEqual([4]);
  });
});
