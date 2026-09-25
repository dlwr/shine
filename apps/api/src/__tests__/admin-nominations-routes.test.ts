import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {eq, getDatabase, type Environment} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {migrate} from '@shine/database/testing';
import {beforeEach, describe, expect, it} from 'vitest';
import {createJWT} from '../auth';
import {adminNominationsRoutes} from '../routes/admin/nominations';

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
    {uid: 'movie-deleted', year: 2019, deletedAt: 1},
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

  authHeaders = {
    Authorization: `Bearer ${await createJWT(JWT_SECRET)}`,
    'Content-Type': 'application/json',
  };
});

async function addNomination(body: unknown, movieUid = 'movie-1') {
  return adminNominationsRoutes.request(
    `/movies/${movieUid}/nominations`,
    {method: 'POST', headers: authHeaders, body: JSON.stringify(body)},
    environment,
  );
}

const validBody = {ceremonyUid: 'ceremony-1', categoryUid: 'category-1'};

describe('POST /movies/:movieId/nominations', () => {
  it('トークンが無ければ 401 を返す', async () => {
    const response = await adminNominationsRoutes.request(
      '/movies/movie-1/nominations',
      {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(validBody),
      },
      environment,
    );

    expect(response.status).toBe(401);
  });

  it('ノミネートを作る', async () => {
    const response = await addNomination({...validBody, isWinner: true});

    expect(response.status).toBe(200);
    const rows = await database
      .select()
      .from(nominations)
      .where(eq(nominations.movieUid, 'movie-1'));
    expect(rows).toHaveLength(1);
  });

  it('受賞の指定を 1 として保存する', async () => {
    await addNomination({...validBody, isWinner: true});

    const [row] = await database
      .select({isWinner: nominations.isWinner})
      .from(nominations);
    expect(row.isWinner).toBe(1);
  });

  it('受賞の指定が無ければ 0 として保存する', async () => {
    await addNomination(validBody);

    const [row] = await database
      .select({isWinner: nominations.isWinner})
      .from(nominations);
    expect(row.isWinner).toBe(0);
  });

  it('授賞式と部門が無ければ 400 を返す', async () => {
    const response = await addNomination({});

    expect(response.status).toBe(400);
  });

  it('映画が無ければ 404 を返す', async () => {
    const response = await addNomination(validBody, 'movie-missing');

    expect(response.status).toBe(404);
  });

  it('論理削除された映画には付けられない', async () => {
    const response = await addNomination(validBody, 'movie-deleted');

    expect(response.status).toBe(404);
  });

  it('授賞式が無ければ 404 を返す', async () => {
    const response = await addNomination({
      ...validBody,
      ceremonyUid: 'ceremony-missing',
    });

    expect(response.status).toBe(404);
  });

  it('部門が無ければ 404 を返す', async () => {
    const response = await addNomination({
      ...validBody,
      categoryUid: 'category-missing',
    });

    expect(response.status).toBe(404);
  });

  it('同じ映画・授賞式・部門の重複は 409 を返す', async () => {
    await addNomination(validBody);

    const response = await addNomination(validBody);

    expect(response.status).toBe(409);
  });
});

describe('PUT /nominations/:nominationId', () => {
  beforeEach(async () => {
    await database.insert(nominations).values({
      uid: 'nomination-1',
      movieUid: 'movie-1',
      ceremonyUid: 'ceremony-1',
      categoryUid: 'category-1',
      isWinner: 0,
    });
  });

  it('トークンが無ければ 401 を返す', async () => {
    const response = await adminNominationsRoutes.request(
      '/nominations/nomination-1',
      {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({isWinner: true}),
      },
      environment,
    );

    expect(response.status).toBe(401);
  });

  it('受賞に切り替える', async () => {
    await adminNominationsRoutes.request(
      '/nominations/nomination-1',
      {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({isWinner: true}),
      },
      environment,
    );

    const [row] = await database
      .select({isWinner: nominations.isWinner})
      .from(nominations);
    expect(row.isWinner).toBe(1);
  });

  it('特記事項を保存する', async () => {
    await adminNominationsRoutes.request(
      '/nominations/nomination-1',
      {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({isWinner: false, specialMention: '審査員特別賞'}),
      },
      environment,
    );

    const [row] = await database
      .select({specialMention: nominations.specialMention})
      .from(nominations);
    expect(row.specialMention).toBe('審査員特別賞');
  });

  it('ノミネートが無ければ 404 を返す', async () => {
    const response = await adminNominationsRoutes.request(
      '/nominations/nomination-missing',
      {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({isWinner: true}),
      },
      environment,
    );

    expect(response.status).toBe(404);
  });
});

describe('DELETE /nominations/:nominationId', () => {
  beforeEach(async () => {
    await database.insert(nominations).values({
      uid: 'nomination-1',
      movieUid: 'movie-1',
      ceremonyUid: 'ceremony-1',
      categoryUid: 'category-1',
      isWinner: 0,
    });
  });

  it('トークンが無ければ 401 を返す', async () => {
    const response = await adminNominationsRoutes.request(
      '/nominations/nomination-1',
      {method: 'DELETE'},
      environment,
    );

    expect(response.status).toBe(401);
  });

  it('ノミネートを消す', async () => {
    const response = await adminNominationsRoutes.request(
      '/nominations/nomination-1',
      {method: 'DELETE', headers: authHeaders},
      environment,
    );

    expect(response.status).toBe(200);
    expect(await database.select().from(nominations)).toHaveLength(0);
  });

  it('ノミネートが無ければ 404 を返す', async () => {
    const response = await adminNominationsRoutes.request(
      '/nominations/nomination-missing',
      {method: 'DELETE', headers: authHeaders},
      environment,
    );

    expect(response.status).toBe(404);
  });
});
