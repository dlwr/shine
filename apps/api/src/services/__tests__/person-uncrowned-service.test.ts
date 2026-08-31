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
import {people} from '@shine/database/schema/people';
import {translations} from '@shine/database/schema/translations';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {beforeEach, describe, expect, it} from 'vitest';
import {PersonUncrownedService} from '../person-uncrowned-service';

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
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'shine-person-uncrowned-'),
  );
  const environment: Environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});
  return {environment, database};
}

const AWARDS = [
  {
    orgUid: 'org-academy',
    orgName: 'Academy Awards',
    categoryUid: 'cat-academy-director',
    categoryName: 'Academy Award for Best Director',
    ceremonyUid: 'ceremony-academy',
    ceremonyYear: 2019,
  },
  {
    orgUid: 'org-bafta',
    orgName: 'British Academy Film Awards',
    categoryUid: 'cat-bafta-director',
    categoryName: 'BAFTA Award for Best Direction',
    ceremonyUid: 'ceremony-bafta',
    ceremonyYear: 2020,
  },
  {
    orgUid: 'org-japan-academy',
    orgName: 'Japan Academy Awards',
    categoryUid: 'cat-japan-academy-lead-actor',
    categoryName: '主演男優賞',
    ceremonyUid: 'ceremony-japan-academy',
    ceremonyYear: 2021,
  },
  {
    orgUid: 'org-academy',
    orgName: 'Academy Awards',
    categoryUid: 'cat-academy-best-picture',
    categoryName: 'Academy Award for Best Picture',
    ceremonyUid: 'ceremony-academy',
    ceremonyYear: 2019,
  },
];

async function seedAwards(database: TestDatabase): Promise<void> {
  const seededOrganizations = new Set<string>();
  const seededCeremonies = new Set<string>();
  for (const award of AWARDS) {
    if (!seededOrganizations.has(award.orgUid)) {
      seededOrganizations.add(award.orgUid);
      await database
        .insert(awardOrganizations)
        .values({uid: award.orgUid, name: award.orgName});
    }

    await database.insert(awardCategories).values({
      uid: award.categoryUid,
      organizationUid: award.orgUid,
      name: award.categoryName,
    });

    if (!seededCeremonies.has(award.ceremonyUid)) {
      seededCeremonies.add(award.ceremonyUid);
      await database.insert(awardCeremonies).values({
        uid: award.ceremonyUid,
        organizationUid: award.orgUid,
        year: award.ceremonyYear,
      });
    }
  }
}

let nextTmdbId = 1;

async function seedPerson(
  database: TestDatabase,
  uid: string,
  options: {name?: string; japaneseName?: string; profilePath?: string} = {},
): Promise<void> {
  await database.insert(people).values({
    uid,
    tmdbId: nextTmdbId++,
    name: options.name ?? uid,
    profilePath: options.profilePath,
  });
  if (options.japaneseName) {
    await database.insert(translations).values({
      resourceType: 'person_name',
      resourceUid: uid,
      languageCode: 'ja',
      content: options.japaneseName,
    });
  }
}

async function seedMovie(
  database: TestDatabase,
  uid: string,
  options: {deleted?: boolean} = {},
): Promise<void> {
  await database.insert(movies).values({
    uid,
    year: 2020,
    deletedAt: options.deleted ? 1_700_000_000 : undefined,
  });
}

async function nominate(
  database: TestDatabase,
  personUid: string | undefined,
  movieUid: string,
  entries: Array<{award: number; isWinner?: boolean}>,
): Promise<void> {
  await database.insert(nominations).values(
    entries.map(entry => ({
      movieUid,
      personUid,
      ceremonyUid: AWARDS[entry.award].ceremonyUid,
      categoryUid: AWARDS[entry.award].categoryUid,
      isWinner: entry.isWinner ? 1 : 0,
    })),
  );
}

describe('PersonUncrownedService.getPersonUncrowned', () => {
  let service: PersonUncrownedService;
  let database: TestDatabase;

  beforeEach(async () => {
    const created = await createTestEnvironment();
    database = created.database;
    service = new PersonUncrownedService(created.environment);
    await seedAwards(database);
    await seedMovie(database, 'movie-a');
    await seedMovie(database, 'movie-b');
    await seedPerson(database, 'person-3losses', {
      name: 'Three Losses',
      japaneseName: '三連敗の監督',
      profilePath: '/three.jpg',
    });
    await seedPerson(database, 'person-2losses', {name: 'Two Losses'});
    await seedPerson(database, 'person-1loss', {name: 'One Loss'});
    await seedPerson(database, 'person-winner', {name: 'The Winner'});
    await nominate(database, 'person-3losses', 'movie-a', [
      {award: 0},
      {award: 1},
    ]);
    await nominate(database, 'person-3losses', 'movie-b', [{award: 2}]);
    await nominate(database, 'person-2losses', 'movie-a', [
      {award: 0},
      {award: 1},
    ]);
    await nominate(database, 'person-1loss', 'movie-a', [{award: 2}]);
    await nominate(database, 'person-winner', 'movie-a', [
      {award: 0, isWinner: true},
    ]);
    await nominate(database, 'person-winner', 'movie-b', [{award: 1}]);
  });

  it('一度も勝っていない映画人を敗北数の多い順に返す', async () => {
    const {topPeople} = await service.getPersonUncrowned({locale: 'ja'});

    expect(topPeople.map(person => person.uid)).toEqual([
      'person-3losses',
      'person-2losses',
      'person-1loss',
    ]);
  });

  it('個人賞を獲ったことのある映画人は含めない', async () => {
    const {topPeople} = await service.getPersonUncrowned({locale: 'ja'});

    expect(topPeople.map(person => person.uid)).not.toContain('person-winner');
  });

  it('敗れた個人賞のslugとセレモニーの年を返す', async () => {
    const {topPeople} = await service.getPersonUncrowned({locale: 'ja'});

    expect(topPeople[0].losses).toEqual([
      {slug: 'academy-director', year: 2019},
      {slug: 'bafta-director', year: 2020},
      {slug: 'japan-academy-lead-actor', year: 2021},
    ]);
  });

  it('作品賞のノミネートは敗北に数えない', async () => {
    await nominate(database, undefined, 'movie-a', [{award: 3}]);

    const {topPeople, nominatedPersonCount} = await service.getPersonUncrowned({
      locale: 'ja',
    });

    expect(topPeople.map(person => person.uid)).toEqual([
      'person-3losses',
      'person-2losses',
      'person-1loss',
    ]);
    expect(nominatedPersonCount).toBe(4);
  });

  it('ロケールの人物名翻訳を優先して返す', async () => {
    const {topPeople} = await service.getPersonUncrowned({locale: 'ja'});

    expect(topPeople[0].name).toBe('三連敗の監督');
    expect(topPeople[0].profilePath).toBe('/three.jpg');
  });

  it('翻訳がなければ人物名をそのまま返す', async () => {
    const {topPeople} = await service.getPersonUncrowned({locale: 'ja'});

    expect(topPeople[1].name).toBe('Two Losses');
  });

  it('個人賞にノミネートされた映画人の総数を返す', async () => {
    const {nominatedPersonCount} = await service.getPersonUncrowned({
      locale: 'ja',
    });

    expect(nominatedPersonCount).toBe(4);
  });

  it('無冠の映画人の総数を返す', async () => {
    const {uncrownedPersonCount} = await service.getPersonUncrowned({
      locale: 'ja',
    });

    expect(uncrownedPersonCount).toBe(3);
  });

  it('敗れた賞の一覧を返す', async () => {
    const {awards} = await service.getPersonUncrowned({locale: 'ja'});

    expect(awards).toEqual([
      {
        slug: 'academy-director',
        name: '監督賞',
        shortLabel: 'アカデミー',
        organization: 'アカデミー賞',
      },
      {
        slug: 'bafta-director',
        name: '監督賞',
        shortLabel: 'BAFTA',
        organization: '英国アカデミー賞',
      },
      {
        slug: 'japan-academy-lead-actor',
        name: '最優秀主演男優賞',
        shortLabel: '日本アカデミー',
        organization: '日本アカデミー賞',
      },
    ]);
  });

  it('論理削除された映画のノミネートは数えない', async () => {
    await seedMovie(database, 'movie-deleted', {deleted: true});
    await seedPerson(database, 'person-deleted-only', {name: 'Deleted Only'});
    await nominate(database, 'person-deleted-only', 'movie-deleted', [
      {award: 0},
      {award: 1},
    ]);

    const {topPeople, nominatedPersonCount, uncrownedPersonCount} =
      await service.getPersonUncrowned({locale: 'ja'});

    expect(topPeople.map(person => person.uid)).not.toContain(
      'person-deleted-only',
    );
    expect(nominatedPersonCount).toBe(4);
    expect(uncrownedPersonCount).toBe(3);
  });

  it('上限を超える映画人は返さない', async () => {
    const {topPeople} = await service.getPersonUncrowned({
      locale: 'ja',
      limit: 1,
    });

    expect(topPeople.map(person => person.uid)).toEqual(['person-3losses']);
  });
});
