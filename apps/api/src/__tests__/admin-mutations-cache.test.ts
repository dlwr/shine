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
import {createJWT} from '../auth';
import {adminMoviesRoutes} from '../routes/admin/movies';
import {adminNominationsRoutes} from '../routes/admin/nominations';
import {moviesRoutes} from '../routes/movies';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

const JWT_SECRET = 'test-jwt-secret';

type MovieDetailResponse = {
  year: number;
  nominations: Array<{uid: string}>;
};

function createKvStub(): KVNamespace {
  const store = new Map<string, string>();
  return {
    async get(key: string) {
      const value = store.get(key);
      return value === undefined ? undefined : JSON.parse(value);
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
  } as unknown as KVNamespace;
}

async function createTestEnvironment(): Promise<Environment> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-test-'));
  const environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
    JWT_SECRET,
  } as Environment;
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});

  await database.insert(movies).values({uid: 'movie-1', year: 2020});
  await database
    .insert(awardOrganizations)
    .values({uid: 'org-1', name: 'Test Award'});
  await database
    .insert(awardCeremonies)
    .values({uid: 'ceremony-1', organizationUid: 'org-1', year: 2020});
  await database.insert(awardCategories).values({
    uid: 'category-1',
    organizationUid: 'org-1',
    name: 'Best Picture',
  });
  await database.insert(nominations).values({
    uid: 'nomination-1',
    movieUid: 'movie-1',
    ceremonyUid: 'ceremony-1',
    categoryUid: 'category-1',
    isWinner: 1,
  });
  await database.insert(translations).values({
    resourceType: 'movie_title',
    resourceUid: 'movie-1',
    languageCode: 'ja',
    content: '映画1',
    isDefault: 1,
  });

  environment.CACHE_KV = createKvStub();
  return environment;
}

async function getMovieDetailStatus(environment: Environment): Promise<number> {
  const response = await moviesRoutes.request(
    '/movie-1?locale=ja',
    {},
    environment,
  );
  return response.status;
}

async function getMovieDetailBody(
  environment: Environment,
): Promise<MovieDetailResponse> {
  const response = await moviesRoutes.request(
    '/movie-1?locale=ja',
    {},
    environment,
  );
  return (await response.json()) as MovieDetailResponse;
}

describe('admin mutations cache invalidation', () => {
  let environment: Environment;
  let authHeaders: {Authorization: string};

  beforeEach(async () => {
    environment = await createTestEnvironment();
    authHeaders = {Authorization: `Bearer ${await createJWT(JWT_SECRET)}`};
  });

  it('admin映画削除後に映画詳細キャッシュが無効化される', async () => {
    expect(await getMovieDetailStatus(environment)).toBe(200);

    const response = await adminMoviesRoutes.request(
      '/movies/movie-1',
      {method: 'DELETE', headers: authHeaders},
      environment,
    );
    expect(response.status).toBe(200);

    expect(await getMovieDetailStatus(environment)).toBe(404);
  });

  it('admin映画更新後に映画詳細キャッシュが無効化される', async () => {
    const before = await getMovieDetailBody(environment);
    expect(before.year).toBe(2020);

    const response = await adminMoviesRoutes.request(
      '/movies/movie-1',
      {
        method: 'PUT',
        headers: {...authHeaders, 'Content-Type': 'application/json'},
        body: JSON.stringify({year: 2021}),
      },
      environment,
    );
    expect(response.status).toBe(200);

    const after = await getMovieDetailBody(environment);
    expect(after.year).toBe(2021);
  });

  it('adminノミネート削除後に映画詳細キャッシュが無効化される', async () => {
    const before = await getMovieDetailBody(environment);
    expect(before.nominations).toHaveLength(1);

    const response = await adminNominationsRoutes.request(
      '/nominations/nomination-1',
      {method: 'DELETE', headers: authHeaders},
      environment,
    );
    expect(response.status).toBe(200);

    const after = await getMovieDetailBody(environment);
    expect(after.nominations).toHaveLength(0);
  });
});
