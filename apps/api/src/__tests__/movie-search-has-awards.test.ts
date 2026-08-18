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
import {moviesRoutes} from '../routes/movies';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

type SearchResponse = {
  movies: Array<{uid: string}>;
  pagination: {totalCount: number};
};

async function createTestEnvironment(): Promise<Environment> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-test-'));
  const environment: Environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});

  await database.insert(awardOrganizations).values({
    uid: 'org-cannes',
    name: 'Cannes Film Festival',
  });
  await database.insert(awardCategories).values({
    uid: 'cat-palme',
    organizationUid: 'org-cannes',
    name: "Palme d'Or",
  });
  await database.insert(awardCeremonies).values([
    {uid: 'cer-2022', organizationUid: 'org-cannes', year: 2022},
    {uid: 'cer-2023', organizationUid: 'org-cannes', year: 2023},
  ]);

  await database.insert(movies).values([
    {uid: 'movie-awarded-1', year: 2022},
    {uid: 'movie-awarded-2', year: 2023},
    {uid: 'movie-plain-1', year: 2022},
    {uid: 'movie-plain-2', year: 2023},
    {uid: 'movie-deleted', year: 2023, deletedAt: 1},
  ]);

  await database.insert(translations).values(
    [
      'movie-awarded-1',
      'movie-awarded-2',
      'movie-plain-1',
      'movie-plain-2',
      'movie-deleted',
    ].map(uid => ({
      resourceType: 'movie_title' as const,
      resourceUid: uid,
      languageCode: 'en',
      content: `Title ${uid}`,
      isDefault: 1,
    })),
  );

  await database.insert(nominations).values([
    {
      uid: 'nom-1',
      movieUid: 'movie-awarded-1',
      ceremonyUid: 'cer-2022',
      categoryUid: 'cat-palme',
      isWinner: 1,
    },
    {
      uid: 'nom-2',
      movieUid: 'movie-awarded-2',
      ceremonyUid: 'cer-2023',
      categoryUid: 'cat-palme',
      isWinner: 0,
    },
  ]);

  return environment;
}

async function search(environment: Environment, queryString: string) {
  const response = await moviesRoutes.request(
    `/search${queryString}`,
    {},
    environment,
  );
  expect(response.status).toBe(200);
  return (await response.json()) as SearchResponse;
}

describe('GET /movies/search hasAwards filter', () => {
  let environment: Environment;

  beforeEach(async () => {
    environment = await createTestEnvironment();
  });

  it('hasAwards=false でノミネートのない映画だけを返す', async () => {
    const body = await search(environment, '?hasAwards=false');

    expect(body.movies.map(movie => movie.uid).toSorted((a, b) => a.localeCompare(b))).toEqual([
      'movie-plain-1',
      'movie-plain-2',
    ]);
  });

  it('hasAwards=false の totalCount はノミネートのない映画の件数', async () => {
    const body = await search(environment, '?hasAwards=false');

    expect(body.pagination.totalCount).toBe(2);
  });

  it('hasAwards=true でノミネートのある映画だけを返す', async () => {
    const body = await search(environment, '?hasAwards=true');

    expect(body.movies.map(movie => movie.uid).toSorted((a, b) => a.localeCompare(b))).toEqual([
      'movie-awarded-1',
      'movie-awarded-2',
    ]);
  });

  it('hasAwards=true の totalCount はノミネートのある映画の件数', async () => {
    const body = await search(environment, '?hasAwards=true');

    expect(body.pagination.totalCount).toBe(2);
  });

  it('hasAwards 未指定なら削除済み以外の全映画を返す', async () => {
    const body = await search(environment, '');

    expect(body.movies.map(movie => movie.uid).toSorted((a, b) => a.localeCompare(b))).toEqual([
      'movie-awarded-1',
      'movie-awarded-2',
      'movie-plain-1',
      'movie-plain-2',
    ]);
  });
});
