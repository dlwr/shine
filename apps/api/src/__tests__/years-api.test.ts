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
import {posterUrls} from '@shine/database/schema/poster-urls';
import {translations} from '@shine/database/schema/translations';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {beforeEach, describe, expect, it} from 'vitest';
import {yearsRoutes} from '../routes/years';
import type {YearDetail, YearSummary} from '@shine/types';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

async function createTestEnvironment(): Promise<Environment> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-years-'));
  const environment: Environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});

  await database.insert(awardOrganizations).values([
    {uid: 'org-cannes', name: 'Cannes Film Festival'},
    {uid: 'org-academy', name: 'Academy Awards'},
  ]);
  await database.insert(awardCategories).values([
    {uid: 'cat-palme', organizationUid: 'org-cannes', name: "Palme d'Or"},
    {
      uid: 'cat-best-picture',
      organizationUid: 'org-academy',
      name: 'Academy Award for Best Picture',
    },
  ]);
  await database.insert(awardCeremonies).values([
    {uid: 'cannes-2023', organizationUid: 'org-cannes', year: 2023},
    {uid: 'academy-2024', organizationUid: 'org-academy', year: 2024},
    {uid: 'academy-2023', organizationUid: 'org-academy', year: 2023},
  ]);
  await database.insert(movies).values([
    {uid: 'movie-winner', year: 2023},
    {uid: 'movie-double', year: 2023},
    {uid: 'movie-zeta', year: 2023},
    {uid: 'movie-alpha', year: 2023},
    {uid: 'movie-deleted', year: 2023, deletedAt: 1},
    {uid: 'movie-unnominated', year: 2023},
    {uid: 'movie-2022', year: 2022},
  ]);
  await database.insert(translations).values([
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-winner',
      languageCode: 'ja',
      content: '落下の解剖学',
    },
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-winner',
      languageCode: 'en',
      content: 'Anatomy of a Fall',
      isDefault: 1,
    },
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-double',
      languageCode: 'en',
      content: 'The Zone of Interest',
      isDefault: 1,
    },
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-zeta',
      languageCode: 'en',
      content: 'Zeta',
      isDefault: 1,
    },
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-alpha',
      languageCode: 'en',
      content: 'Alpha',
      isDefault: 1,
    },
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-deleted',
      languageCode: 'en',
      content: 'Deleted',
      isDefault: 1,
    },
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-2022',
      languageCode: 'en',
      content: 'Everything Everywhere All at Once',
      isDefault: 1,
    },
  ]);
  await database.insert(posterUrls).values({
    movieUid: 'movie-winner',
    url: 'https://example.com/anatomy.jpg',
    isPrimary: 1,
  });
  await database.insert(nominations).values([
    {
      movieUid: 'movie-winner',
      ceremonyUid: 'cannes-2023',
      categoryUid: 'cat-palme',
      isWinner: 1,
    },
    {
      movieUid: 'movie-double',
      ceremonyUid: 'cannes-2023',
      categoryUid: 'cat-palme',
    },
    {
      movieUid: 'movie-double',
      ceremonyUid: 'academy-2024',
      categoryUid: 'cat-best-picture',
    },
    {
      movieUid: 'movie-zeta',
      ceremonyUid: 'cannes-2023',
      categoryUid: 'cat-palme',
    },
    {
      movieUid: 'movie-alpha',
      ceremonyUid: 'cannes-2023',
      categoryUid: 'cat-palme',
    },
    {
      movieUid: 'movie-deleted',
      ceremonyUid: 'cannes-2023',
      categoryUid: 'cat-palme',
    },
    {
      movieUid: 'movie-2022',
      ceremonyUid: 'academy-2023',
      categoryUid: 'cat-best-picture',
      isWinner: 1,
    },
  ]);

  return environment;
}

async function fetchYears(environment: Environment) {
  const response = await yearsRoutes.request('/', {}, environment);
  const body = (await response.json()) as {years: YearSummary[]};

  return {response, body};
}

async function fetchYear(environment: Environment, year: string) {
  const response = await yearsRoutes.request(`/${year}`, {}, environment);
  const body = (await response.json()) as YearDetail;

  return {response, body};
}

describe('GET /years', () => {
  let environment: Environment;

  beforeEach(async () => {
    environment = await createTestEnvironment();
  });

  it('選出された映画がある年を新しい順に返す', async () => {
    const {response, body} = await fetchYears(environment);

    expect(response.status).toBe(200);
    expect(body.years.map(entry => entry.year)).toEqual([2023, 2022]);
  });

  it('年ごとの映画数を返す', async () => {
    const {body} = await fetchYears(environment);

    expect(body.years.find(entry => entry.year === 2023)?.movieCount).toBe(4);
  });

  it('年ごとの受賞作数を返す', async () => {
    const {body} = await fetchYears(environment);

    expect(body.years.find(entry => entry.year === 2023)?.winnerCount).toBe(1);
  });
});

describe('GET /years/:year', () => {
  let environment: Environment;

  beforeEach(async () => {
    environment = await createTestEnvironment();
  });

  it('その年の映画を返す', async () => {
    const {response, body} = await fetchYear(environment, '2023');

    expect(response.status).toBe(200);
    expect(body.year).toBe(2023);
    expect(body.movies).toHaveLength(4);
  });

  it('受賞作、選出数の多い順、タイトル順で並べる', async () => {
    const {body} = await fetchYear(environment, '2023');

    expect(body.movies.map(movie => movie.uid)).toEqual([
      'movie-winner',
      'movie-double',
      'movie-alpha',
      'movie-zeta',
    ]);
  });

  it('映画ごとに選出された賞と受賞の有無を返す', async () => {
    const {body} = await fetchYear(environment, '2023');

    const winner = body.movies.find(movie => movie.uid === 'movie-winner');
    expect(winner?.isWinner).toBe(true);
    expect(winner?.awards).toEqual([{slug: 'palme-dor', isWinner: true}]);

    const double = body.movies.find(movie => movie.uid === 'movie-double');
    expect(double?.isWinner).toBe(false);
    expect(double?.awards).toEqual([
      {slug: 'palme-dor', isWinner: false},
      {slug: 'academy-best-picture', isWinner: false},
    ]);
  });

  it('日本語タイトルを優先し、無ければデフォルトタイトルを返す', async () => {
    const {body} = await fetchYear(environment, '2023');

    expect(body.movies.find(movie => movie.uid === 'movie-winner')?.title).toBe(
      '落下の解剖学',
    );
    expect(body.movies.find(movie => movie.uid === 'movie-double')?.title).toBe(
      'The Zone of Interest',
    );
  });

  it('ポスターURLを返す', async () => {
    const {body} = await fetchYear(environment, '2023');

    expect(
      body.movies.find(movie => movie.uid === 'movie-winner')?.posterUrl,
    ).toBe('https://example.com/anatomy.jpg');
  });

  it('その年に登場する賞の一覧を定義順で返す', async () => {
    const {body} = await fetchYear(environment, '2023');

    expect(body.awards).toEqual([
      {
        slug: 'palme-dor',
        shortLabel: 'カンヌ',
        name: 'パルム・ドール',
        organization: 'カンヌ国際映画祭',
      },
      {
        slug: 'academy-best-picture',
        shortLabel: 'アカデミー',
        name: '作品賞',
        organization: 'アカデミー賞',
      },
    ]);
  });

  it('映画がある前後の年を返す', async () => {
    const {body} = await fetchYear(environment, '2022');

    expect(body.previousYear).toBeUndefined();
    expect(body.nextYear).toBe(2023);
  });

  it('削除済みの映画を含めない', async () => {
    const {body} = await fetchYear(environment, '2023');

    expect(body.movies.map(movie => movie.uid)).not.toContain('movie-deleted');
  });

  it('どの賞にも選ばれていない映画を含めない', async () => {
    const {body} = await fetchYear(environment, '2023');

    expect(body.movies.map(movie => movie.uid)).not.toContain(
      'movie-unnominated',
    );
  });

  it('映画のない年は404を返す', async () => {
    const {response} = await fetchYear(environment, '1800');

    expect(response.status).toBe(404);
  });

  it('整数でない年は404を返す', async () => {
    const {response} = await fetchYear(environment, 'abc');

    expect(response.status).toBe(404);
  });
});
