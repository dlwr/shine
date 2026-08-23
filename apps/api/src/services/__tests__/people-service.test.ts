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
    {uid: 'movie-dreams', year: 1990},
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
    {uid: 'person-multi', tmdbId: 7450, name: 'ビートたけし'},
    {uid: 'person-prolific', tmdbId: 1001, name: '仲代達矢'},
    {uid: 'person-single', tmdbId: 1002, name: '寺尾聰'},
    {uid: 'person-deleted-only', tmdbId: 1003, name: '消えた俳優'},
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
    {
      movieUid: 'movie-ran',
      personUid: 'person-multi',
      creditId: 'c4',
      department: 'Directing',
      job: 'Director',
    },
    {
      movieUid: 'movie-ran',
      personUid: 'person-multi',
      creditId: 'c5',
      department: 'Writing',
      job: 'Screenplay',
    },
    {
      movieUid: 'movie-ran',
      personUid: 'person-multi',
      creditId: 'c6',
      department: 'Acting',
      character: '本人',
      castOrder: 0,
    },
    {
      movieUid: 'movie-ran',
      personUid: 'person-prolific',
      creditId: 'c7',
      department: 'Acting',
      castOrder: 1,
    },
    {
      movieUid: 'movie-kagemusha',
      personUid: 'person-prolific',
      creditId: 'c8',
      department: 'Acting',
      castOrder: 0,
    },
    {
      movieUid: 'movie-dreams',
      personUid: 'person-prolific',
      creditId: 'c9',
      department: 'Acting',
      castOrder: 0,
    },
    {
      movieUid: 'movie-ran',
      personUid: 'person-single',
      creditId: 'c10',
      department: 'Acting',
      castOrder: 2,
    },
    {
      movieUid: 'movie-deleted',
      personUid: 'person-deleted-only',
      creditId: 'c11',
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

  it('同じ映画の複数の役割を1件にまとめる', async () => {
    const service = new PeopleService(environment);

    const person = await service.getPerson('person-multi', 'ja');

    expect(person?.credits).toHaveLength(1);
    expect(person?.credits[0].jobs).toEqual(['Director', 'Screenplay']);
  });

  it('出演の役名を持つ', async () => {
    const service = new PeopleService(environment);

    const person = await service.getPerson('person-multi', 'ja');

    expect(person?.credits[0].character).toBe('本人');
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

    expect(person?.credits[0].jobs).toEqual(['Director']);
  });

  it('存在しない人物には undefined を返す', async () => {
    const service = new PeopleService(environment);

    const person = await service.getPerson('person-missing', 'ja');

    expect(person).toBeUndefined();
  });
});

describe('PeopleService.listPeople', () => {
  let environment: Environment;

  beforeEach(async () => {
    ({environment} = await createTestEnvironment());
  });

  it('2本以上に参加した人物を返す', async () => {
    const service = new PeopleService(environment);

    const result = await service.listPeople({page: 1, limit: 10});

    expect(result.people.map(person => person.uid)).toContain(
      'person-kurosawa',
    );
  });

  it('監督は1本でも返す', async () => {
    const service = new PeopleService(environment);

    const result = await service.listPeople({page: 1, limit: 10});

    expect(result.people.map(person => person.uid)).toContain('person-multi');
  });

  it('1本に出演しただけの人物は返さない', async () => {
    const service = new PeopleService(environment);

    const result = await service.listPeople({page: 1, limit: 10});

    expect(result.people.map(person => person.uid)).not.toContain(
      'person-single',
    );
  });

  it('論理削除された映画だけに参加した人物は返さない', async () => {
    const service = new PeopleService(environment);

    const result = await service.listPeople({page: 1, limit: 10});

    expect(result.people.map(person => person.uid)).not.toContain(
      'person-deleted-only',
    );
  });

  it('参加作品数に論理削除された映画を数えない', async () => {
    const service = new PeopleService(environment);

    const result = await service.listPeople({page: 1, limit: 10});

    expect(
      result.people.find(person => person.uid === 'person-kurosawa')
        ?.movieCount,
    ).toBe(2);
  });

  it('参加作品数の多い順に並べる', async () => {
    const service = new PeopleService(environment);

    const result = await service.listPeople({page: 1, limit: 10});

    expect(result.people.map(person => person.uid)).toEqual([
      'person-prolific',
      'person-kurosawa',
      'person-multi',
    ]);
  });

  it('人物名を返す', async () => {
    const service = new PeopleService(environment);

    const result = await service.listPeople({page: 1, limit: 10});

    expect(
      result.people.find(person => person.uid === 'person-prolific')?.name,
    ).toBe('仲代達矢');
  });

  it('ページを切り出す', async () => {
    const service = new PeopleService(environment);

    const result = await service.listPeople({page: 2, limit: 1});

    expect(result.people.map(person => person.uid)).toEqual([
      'person-kurosawa',
    ]);
  });

  it('総件数を返す', async () => {
    const service = new PeopleService(environment);

    const result = await service.listPeople({page: 2, limit: 1});

    expect(result.pagination).toEqual({
      page: 2,
      perPage: 1,
      totalCount: 3,
      totalPages: 3,
    });
  });
});
