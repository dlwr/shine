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

const AWARDS = [
  {
    orgUid: 'org-cannes',
    orgName: 'Cannes Film Festival',
    categoryUid: 'cat-palme',
    categoryName: "Palme d'Or",
    ceremonyUid: 'ceremony-cannes',
    ceremonyYear: 1980,
  },
  {
    orgUid: 'org-academy',
    orgName: 'Academy Awards',
    categoryUid: 'cat-best-picture',
    categoryName: 'Academy Award for Best Picture',
    ceremonyUid: 'ceremony-academy',
    ceremonyYear: 1990,
  },
  {
    orgUid: 'org-1001',
    orgName: '1001 Movies You Must See Before You Die',
    categoryUid: 'cat-1001',
    categoryName: 'Selected Films',
    ceremonyUid: 'ceremony-1001',
    ceremonyYear: 2020,
  },
];

async function createTestEnvironment(): Promise<{
  environment: Environment;
  database: TestDatabase;
}> {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'shine-prominent-'),
  );
  const environment: Environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});

  for (const award of AWARDS) {
    await database
      .insert(awardOrganizations)
      .values({uid: award.orgUid, name: award.orgName});
    await database.insert(awardCategories).values({
      uid: award.categoryUid,
      organizationUid: award.orgUid,
      name: award.categoryName,
    });
    await database.insert(awardCeremonies).values({
      uid: award.ceremonyUid,
      organizationUid: award.orgUid,
      year: award.ceremonyYear,
    });
  }

  await database.insert(movies).values([
    {uid: 'movie-a', year: 1980},
    {uid: 'movie-b', year: 1990},
    {uid: 'movie-c', year: 2000},
    {uid: 'movie-listed', year: 2010},
    {uid: 'movie-deleted', year: 2015, deletedAt: 1_700_000_000},
  ]);

  await database.insert(translations).values([
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-a',
      languageCode: 'ja',
      content: '映画A',
      isDefault: 1,
    },
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-b',
      languageCode: 'ja',
      content: '映画B',
      isDefault: 1,
    },
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-c',
      languageCode: 'ja',
      content: '映画C',
      isDefault: 1,
    },
    {
      resourceType: 'person_name',
      resourceUid: 'person-foreign',
      languageCode: 'ja',
      content: 'マーティン・スコセッシ',
    },
  ]);

  await database.insert(nominations).values([
    {
      movieUid: 'movie-a',
      ceremonyUid: 'ceremony-cannes',
      categoryUid: 'cat-palme',
      isWinner: 1,
    },
    {
      movieUid: 'movie-b',
      ceremonyUid: 'ceremony-academy',
      categoryUid: 'cat-best-picture',
      isWinner: 1,
    },
    {
      movieUid: 'movie-c',
      ceremonyUid: 'ceremony-academy',
      categoryUid: 'cat-best-picture',
      isWinner: 0,
    },
    {
      movieUid: 'movie-listed',
      ceremonyUid: 'ceremony-1001',
      categoryUid: 'cat-1001',
      isWinner: 0,
    },
    {
      movieUid: 'movie-deleted',
      ceremonyUid: 'ceremony-cannes',
      categoryUid: 'cat-palme',
      isWinner: 1,
    },
  ]);

  await database.insert(people).values([
    {uid: 'person-master', tmdbId: 1, name: '巨匠'},
    {uid: 'person-foreign', tmdbId: 2, name: 'Martin Scorsese'},
    {uid: 'person-listed', tmdbId: 3, name: 'リストだけの監督'},
    {uid: 'person-actor', tmdbId: 4, name: '名優', profilePath: '/face.jpg'},
    {uid: 'person-deleted', tmdbId: 5, name: '消えた監督'},
  ]);

  await database.insert(movieCredits).values([
    {
      movieUid: 'movie-a',
      personUid: 'person-master',
      creditId: 'c1',
      department: 'Directing',
      job: 'Director',
    },
    {
      movieUid: 'movie-b',
      personUid: 'person-master',
      creditId: 'c2',
      department: 'Directing',
      job: 'Director',
    },
    {
      movieUid: 'movie-c',
      personUid: 'person-master',
      creditId: 'c3',
      department: 'Directing',
      job: 'Director',
    },
    {
      movieUid: 'movie-a',
      personUid: 'person-master',
      creditId: 'c4',
      department: 'Writing',
      job: 'Screenplay',
    },
    {
      movieUid: 'movie-b',
      personUid: 'person-foreign',
      creditId: 'c5',
      department: 'Directing',
      job: 'Director',
    },
    {
      movieUid: 'movie-listed',
      personUid: 'person-listed',
      creditId: 'c6',
      department: 'Directing',
      job: 'Director',
    },
    {
      movieUid: 'movie-deleted',
      personUid: 'person-deleted',
      creditId: 'c7',
      department: 'Directing',
      job: 'Director',
    },
    {
      movieUid: 'movie-a',
      personUid: 'person-actor',
      creditId: 'c8',
      department: 'Acting',
      character: '主人公',
      castOrder: 0,
    },
    {
      movieUid: 'movie-b',
      personUid: 'person-actor',
      creditId: 'c9',
      department: 'Acting',
      character: '王',
      castOrder: 1,
    },
    {
      movieUid: 'movie-c',
      personUid: 'person-master',
      creditId: 'c10',
      department: 'Acting',
      character: '本人',
      castOrder: 0,
    },
  ]);

  return {environment, database};
}

describe('PeopleService.getProminentPeople', () => {
  let environment: Environment;

  beforeEach(async () => {
    ({environment} = await createTestEnvironment());
  });

  it('監督を受賞作の多い順に並べる', async () => {
    const service = new PeopleService(environment);

    const {directors} = await service.getProminentPeople({locale: 'ja'});

    expect(directors.map(director => director.uid)).toEqual([
      'person-master',
      'person-foreign',
    ]);
  });

  it('受賞作の本数を数える', async () => {
    const service = new PeopleService(environment);

    const {directors} = await service.getProminentPeople({locale: 'ja'});

    expect(directors[0]?.wonCount).toBe(2);
  });

  it('ノミネート作の本数を数える', async () => {
    const service = new PeopleService(environment);

    const {directors} = await service.getProminentPeople({locale: 'ja'});

    expect(directors[0]?.nominatedCount).toBe(3);
  });

  it('リスト型の賞しか持たない監督は含めない', async () => {
    const service = new PeopleService(environment);

    const {directors} = await service.getProminentPeople({locale: 'ja'});

    expect(directors.map(director => director.uid)).not.toContain(
      'person-listed',
    );
  });

  it('削除済み映画しか持たない監督は含めない', async () => {
    const service = new PeopleService(environment);

    const {directors} = await service.getProminentPeople({locale: 'ja'});

    expect(directors.map(director => director.uid)).not.toContain(
      'person-deleted',
    );
  });

  it('locale が ja なら日本語名を返す', async () => {
    const service = new PeopleService(environment);

    const {directors} = await service.getProminentPeople({locale: 'ja'});

    expect(directors[1]?.name).toBe('マーティン・スコセッシ');
  });

  it('locale が en なら原語名を返す', async () => {
    const service = new PeopleService(environment);

    const {directors} = await service.getProminentPeople({locale: 'en'});

    expect(directors[1]?.name).toBe('Martin Scorsese');
  });

  it('代表作は受賞作を新しい年から並べる', async () => {
    const service = new PeopleService(environment);

    const {directors} = await service.getProminentPeople({locale: 'ja'});

    expect(directors[0]?.topMovies.map(movie => movie.title)).toEqual([
      '映画B',
      '映画A',
    ]);
  });

  it('俳優を受賞作の多い順に並べる', async () => {
    const service = new PeopleService(environment);

    const {actors} = await service.getProminentPeople({locale: 'ja'});

    expect(actors.map(actor => actor.uid)).toEqual([
      'person-actor',
      'person-master',
    ]);
  });

  it('俳優の写真を返す', async () => {
    const service = new PeopleService(environment);

    const {actors} = await service.getProminentPeople({locale: 'ja'});

    expect(actors[0]?.profilePath).toBe('/face.jpg');
  });

  it('limit で人数を絞る', async () => {
    const service = new PeopleService(environment);

    const {directors} = await service.getProminentPeople({
      locale: 'ja',
      limit: 1,
    });

    expect(directors).toHaveLength(1);
  });
});
