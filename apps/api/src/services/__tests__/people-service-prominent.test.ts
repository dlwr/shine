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

  await database.insert(awardOrganizations).values([
    {uid: 'org-japan-academy', name: 'Japan Academy Awards'},
    {uid: 'org-academy', name: 'Academy Awards'},
  ]);
  await database.insert(awardCategories).values([
    {
      uid: 'cat-director',
      organizationUid: 'org-japan-academy',
      name: '監督賞',
    },
    {
      uid: 'cat-lead-actor',
      organizationUid: 'org-japan-academy',
      name: '主演男優賞',
    },
    {
      uid: 'cat-best-picture',
      organizationUid: 'org-academy',
      name: 'Academy Award for Best Picture',
    },
  ]);
  await database.insert(awardCeremonies).values([
    {uid: 'ceremony-1990', organizationUid: 'org-japan-academy', year: 1990},
    {uid: 'ceremony-1991', organizationUid: 'org-japan-academy', year: 1991},
    {uid: 'ceremony-1992', organizationUid: 'org-japan-academy', year: 1992},
    {uid: 'ceremony-academy', organizationUid: 'org-academy', year: 1990},
  ]);

  await database.insert(movies).values([
    {uid: 'movie-a', year: 1980},
    {uid: 'movie-a2', year: 1981},
    {uid: 'movie-b', year: 1990},
    {uid: 'movie-c', year: 2000},
    {uid: 'movie-picture', year: 2005},
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
      resourceUid: 'movie-a2',
      languageCode: 'ja',
      content: '映画A2',
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

  await database.insert(people).values([
    {uid: 'person-master', tmdbId: 1, name: '巨匠'},
    {uid: 'person-foreign', tmdbId: 2, name: 'Martin Scorsese'},
    {uid: 'person-picture', tmdbId: 3, name: '作品賞だけの監督'},
    {uid: 'person-actor', tmdbId: 4, name: '名優', profilePath: '/face.jpg'},
    {uid: 'person-deleted', tmdbId: 5, name: '消えた監督'},
  ]);

  await database.insert(nominations).values([
    {
      movieUid: 'movie-a',
      ceremonyUid: 'ceremony-1990',
      categoryUid: 'cat-director',
      personUid: 'person-master',
      isWinner: 1,
    },
    {
      movieUid: 'movie-b',
      ceremonyUid: 'ceremony-1991',
      categoryUid: 'cat-director',
      personUid: 'person-master',
      isWinner: 1,
    },
    {
      movieUid: 'movie-c',
      ceremonyUid: 'ceremony-1992',
      categoryUid: 'cat-director',
      personUid: 'person-master',
      isWinner: 0,
    },
    {
      movieUid: 'movie-c',
      ceremonyUid: 'ceremony-1992',
      categoryUid: 'cat-lead-actor',
      personUid: 'person-master',
      isWinner: 0,
    },
    {
      movieUid: 'movie-picture',
      ceremonyUid: 'ceremony-1992',
      categoryUid: 'cat-director',
      personUid: 'person-foreign',
      isWinner: 0,
    },
    {
      movieUid: 'movie-picture',
      ceremonyUid: 'ceremony-academy',
      categoryUid: 'cat-best-picture',
      isWinner: 1,
    },
    {
      movieUid: 'movie-deleted',
      ceremonyUid: 'ceremony-1990',
      categoryUid: 'cat-director',
      personUid: 'person-deleted',
      isWinner: 1,
    },
    {
      movieUid: 'movie-a',
      ceremonyUid: 'ceremony-1990',
      categoryUid: 'cat-lead-actor',
      personUid: 'person-actor',
      isWinner: 1,
    },
    {
      movieUid: 'movie-a2',
      ceremonyUid: 'ceremony-1990',
      categoryUid: 'cat-lead-actor',
      personUid: 'person-actor',
      isWinner: 1,
    },
    {
      movieUid: 'movie-b',
      ceremonyUid: 'ceremony-1991',
      categoryUid: 'cat-lead-actor',
      personUid: 'person-actor',
      isWinner: 1,
    },
  ]);

  await database.insert(movieCredits).values([
    {
      movieUid: 'movie-picture',
      personUid: 'person-picture',
      creditId: 'c1',
      department: 'Directing',
      job: 'Director',
    },
    {
      movieUid: 'movie-a',
      personUid: 'person-master',
      creditId: 'c2',
      department: 'Directing',
      job: 'Director',
    },
  ]);

  return {environment, database};
}

describe('PeopleService.getProminentPeople', () => {
  let environment: Environment;

  beforeEach(async () => {
    ({environment} = await createTestEnvironment());
  });

  it('監督を監督賞の受賞回数が多い順に並べる', async () => {
    const service = new PeopleService(environment);

    const {directors} = await service.getProminentPeople({locale: 'ja'});

    expect(directors.map(director => director.uid)).toEqual([
      'person-master',
      'person-foreign',
    ]);
  });

  it('受賞回数を数える', async () => {
    const service = new PeopleService(environment);

    const {directors} = await service.getProminentPeople({locale: 'ja'});

    expect(directors[0]?.wonCount).toBe(2);
  });

  it('ノミネート回数を数える', async () => {
    const service = new PeopleService(environment);

    const {directors} = await service.getProminentPeople({locale: 'ja'});

    expect(directors[0]?.nominatedCount).toBe(3);
  });

  it('同じ授賞式で複数作品が紐づく受賞は1回と数える', async () => {
    const service = new PeopleService(environment);

    const {actors} = await service.getProminentPeople({locale: 'ja'});

    expect(actors[0]?.wonCount).toBe(2);
  });

  it('作品賞しか持たない監督は含めない', async () => {
    const service = new PeopleService(environment);

    const {directors} = await service.getProminentPeople({locale: 'ja'});

    expect(directors.map(director => director.uid)).not.toContain(
      'person-picture',
    );
  });

  it('削除済み映画の受賞しか持たない監督は含めない', async () => {
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

  it('代表作は3本までに絞る', async () => {
    const service = new PeopleService(environment);

    const {actors} = await service.getProminentPeople({locale: 'ja'});

    expect(actors[0]?.topMovies.map(movie => movie.title)).toEqual([
      '映画B',
      '映画A2',
      '映画A',
    ]);
  });

  it('俳優を演技賞の受賞回数が多い順に並べる', async () => {
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
