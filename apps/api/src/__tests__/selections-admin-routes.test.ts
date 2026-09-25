import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {eq, getDatabase, type Environment} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movieSelections} from '@shine/database/schema/movie-selections';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {translations} from '@shine/database/schema/translations';
import {migrate} from '@shine/database/testing';
import {beforeEach, describe, expect, it} from 'vitest';
import {createJWT} from '../auth';
import {selectionsAdminRoutes} from '../routes/selections-admin';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

const JWT_SECRET = 'test-jwt-secret';

let environment: Environment;
let database: ReturnType<typeof getDatabase>;
let authHeaders: Record<string, string>;

function createKvStub(): KVNamespace {
  return {
    async get() {
      return null;
    },
    async put() {},
    async delete() {},
    async list() {
      return {keys: [], list_complete: true};
    },
  } as unknown as KVNamespace;
}

beforeEach(async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-test-'));
  environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
    JWT_SECRET,
    CACHE_KV: createKvStub(),
  };
  database = getDatabase(environment);
  await migrate(database, {migrationsFolder});

  await database.insert(movies).values([
    {uid: 'movie-1', year: 2020},
    {uid: 'movie-2', year: 2021},
    {uid: 'movie-deleted', year: 2019, deletedAt: 1},
  ]);
  await database.insert(translations).values([
    {
      uid: 'translation-1',
      resourceType: 'movie_title',
      resourceUid: 'movie-1',
      languageCode: 'en',
      content: 'First Movie',
      isDefault: 1,
    },
    {
      uid: 'translation-2',
      resourceType: 'movie_title',
      resourceUid: 'movie-2',
      languageCode: 'en',
      content: 'Second Movie',
      isDefault: 1,
    },
  ]);
  await database
    .insert(awardOrganizations)
    .values({uid: 'org-1', name: 'Test Awards'});
  await database
    .insert(awardCeremonies)
    .values({uid: 'ceremony-1', organizationUid: 'org-1', year: 2020});
  await database.insert(awardCategories).values({
    uid: 'category-1',
    organizationUid: 'org-1',
    name: 'Best Picture',
  });
  await database.insert(nominations).values([
    {
      uid: 'nomination-1',
      movieUid: 'movie-1',
      ceremonyUid: 'ceremony-1',
      categoryUid: 'category-1',
      isWinner: 1,
    },
    {
      uid: 'nomination-2',
      movieUid: 'movie-2',
      ceremonyUid: 'ceremony-1',
      categoryUid: 'category-1',
      isWinner: 0,
    },
  ]);

  authHeaders = {
    Authorization: `Bearer ${await createJWT(JWT_SECRET)}`,
    'Content-Type': 'application/json',
  };
});

async function post(pathname: string, body: unknown) {
  return selectionsAdminRoutes.request(
    pathname,
    {method: 'POST', headers: authHeaders, body: JSON.stringify(body)},
    environment,
  );
}

describe('POST /reselect', () => {
  it('トークンが無ければ 401 を返す', async () => {
    const response = await selectionsAdminRoutes.request(
      '/reselect',
      {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({type: 'daily'}),
      },
      environment,
    );

    expect(response.status).toBe(401);
  });

  it('指定した日付の選出を引き直す', async () => {
    const response = await post('/reselect', {
      type: 'daily',
      date: '2026-09-18',
    });

    expect(response.status).toBe(200);
    const rows = await database
      .select({selectionDate: movieSelections.selectionDate})
      .from(movieSelections)
      .where(eq(movieSelections.selectionType, 'daily'));
    expect(rows).toStrictEqual([{selectionDate: '2026-09-18'}]);
  });

  it('除外した映画は選ばない', async () => {
    const response = await post('/reselect', {
      type: 'daily',
      date: '2026-09-18',
      excludeMovieUids: ['movie-1'],
    });

    const {movie} = (await response.json()) as {movie: {uid: string}};
    expect(movie.uid).toBe('movie-2');
  });

  it('選出の種類が不正なら 400 を返す', async () => {
    const response = await post('/reselect', {type: 'yearly'});

    expect(response.status).toBe(400);
  });

  it('除外の指定が配列でなければ 400 を返す', async () => {
    const response = await post('/reselect', {
      type: 'daily',
      excludeMovieUids: 'movie-1',
    });

    expect(response.status).toBe(400);
  });

  it('日付の形式が違えば 400 を返す', async () => {
    const response = await post('/reselect', {
      type: 'daily',
      date: '2026/09/18',
    });

    expect(response.status).toBe(400);
  });
});

describe('GET /admin/preview-selections', () => {
  it('トークンが無ければ 401 を返す', async () => {
    const response = await selectionsAdminRoutes.request(
      '/admin/preview-selections',
      {},
      environment,
    );

    expect(response.status).toBe(401);
  });

  it('次の日替わり・週替わり・月替わりを返す', async () => {
    const response = await selectionsAdminRoutes.request(
      '/admin/preview-selections',
      {headers: authHeaders},
      environment,
    );

    expect(response.status).toBe(200);
    expect(Object.keys((await response.json()) as object)).toStrictEqual([
      'nextDaily',
      'nextWeekly',
      'nextMonthly',
    ]);
  });
});

describe('DELETE /admin/cleanup-future-selections', () => {
  it('トークンが無ければ 401 を返す', async () => {
    const response = await selectionsAdminRoutes.request(
      '/admin/cleanup-future-selections',
      {method: 'DELETE'},
      environment,
    );

    expect(response.status).toBe(401);
  });

  it('今日より後の選出だけ消す', async () => {
    await database.insert(movieSelections).values([
      {
        uid: 'selection-past',
        movieId: 'movie-1',
        selectionType: 'daily',
        selectionDate: '2020-01-01',
      },
      {
        uid: 'selection-future',
        movieId: 'movie-2',
        selectionType: 'daily',
        selectionDate: '2999-01-01',
      },
    ]);

    const response = await selectionsAdminRoutes.request(
      '/admin/cleanup-future-selections',
      {method: 'DELETE', headers: authHeaders},
      environment,
    );

    expect(response.status).toBe(200);
    const remaining = await database
      .select({uid: movieSelections.uid})
      .from(movieSelections);
    expect(remaining).toStrictEqual([{uid: 'selection-past'}]);
  });
});

describe('POST /admin/random-movie-preview', () => {
  it('トークンが無ければ 401 を返す', async () => {
    const response = await selectionsAdminRoutes.request(
      '/admin/random-movie-preview',
      {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({}),
      },
      environment,
    );

    expect(response.status).toBe(401);
  });

  it('ノミネートのある映画を 1 本返す', async () => {
    const response = await post('/admin/random-movie-preview', {locale: 'en'});

    expect(response.status).toBe(200);
    const movie = (await response.json()) as {uid: string};
    expect(['movie-1', 'movie-2']).toContain(movie.uid);
  });

  it('ノミネートが 1 件も無ければ 404 を返す', async () => {
    await database.delete(nominations);

    const response = await post('/admin/random-movie-preview', {locale: 'en'});

    expect(response.status).toBe(404);
  });
});

describe('POST /admin/override-selection', () => {
  it('トークンが無ければ 401 を返す', async () => {
    const response = await selectionsAdminRoutes.request(
      '/admin/override-selection',
      {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          type: 'daily',
          date: '2026-09-18',
          movieId: 'movie-1',
        }),
      },
      environment,
    );

    expect(response.status).toBe(401);
  });

  it('指定した映画で上書きする', async () => {
    const response = await post('/admin/override-selection', {
      type: 'daily',
      date: '2026-09-18',
      movieId: 'movie-2',
    });

    expect(response.status).toBe(200);
    const rows = await database
      .select({movieId: movieSelections.movieId})
      .from(movieSelections);
    expect(rows).toStrictEqual([{movieId: 'movie-2'}]);
  });

  it('選出の種類が不正なら 400 を返す', async () => {
    const response = await post('/admin/override-selection', {
      type: 'yearly',
      date: '2026-09-18',
      movieId: 'movie-1',
    });

    expect(response.status).toBe(400);
  });

  it('日付が無ければ 400 を返す', async () => {
    const response = await post('/admin/override-selection', {
      type: 'daily',
      movieId: 'movie-1',
    });

    expect(response.status).toBe(400);
  });

  it('映画の指定が無ければ 400 を返す', async () => {
    const response = await post('/admin/override-selection', {
      type: 'daily',
      date: '2026-09-18',
    });

    expect(response.status).toBe(400);
  });

  it('日付の形式が違えば 400 を返す', async () => {
    const response = await post('/admin/override-selection', {
      type: 'daily',
      date: '2026/09/18',
      movieId: 'movie-1',
    });

    expect(response.status).toBe(400);
  });

  it('映画が無ければ 404 を返す', async () => {
    const response = await post('/admin/override-selection', {
      type: 'daily',
      date: '2026-09-18',
      movieId: 'movie-missing',
    });

    expect(response.status).toBe(404);
  });

  it('論理削除された映画は指定できない', async () => {
    const response = await post('/admin/override-selection', {
      type: 'daily',
      date: '2026-09-18',
      movieId: 'movie-deleted',
    });

    expect(response.status).toBe(404);
  });
});
