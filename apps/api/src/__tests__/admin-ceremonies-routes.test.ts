import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {migrate} from '@shine/database/testing';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {createJWT} from '../auth';
import {adminCeremoniesRoutes} from '../routes/admin/ceremonies';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

const JWT_SECRET = 'test-jwt-secret';

let environment: Environment;
let authHeaders: Record<string, string>;

async function request(
  route: string,
  init: RequestInit = {},
  headers: Record<string, string> = authHeaders,
): Promise<Response> {
  return adminCeremoniesRoutes.request(
    route,
    {...init, headers: {...headers, ...init.headers}},
    environment,
  );
}

beforeEach(async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-test-'));
  environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
    JWT_SECRET,
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});
  await database
    .insert(awardOrganizations)
    .values({uid: 'org', name: 'Org', shortName: 'ORG', country: 'JP'});
  await database
    .insert(awardCategories)
    .values({uid: 'category', organizationUid: 'org', name: 'Best Film'});
  await database.insert(awardCeremonies).values([
    {uid: 'c-2020', organizationUid: 'org', year: 2020, ceremonyNumber: 1},
    {uid: 'c-2021', organizationUid: 'org', year: 2021, ceremonyNumber: 2},
  ]);
  authHeaders = {
    Authorization: `Bearer ${await createJWT(JWT_SECRET)}`,
    'Content-Type': 'application/json',
  };
});

describe('admin ceremonies の認証', () => {
  it('トークンが無ければ 401 を返す', async () => {
    const response = await request('/ceremonies', {}, {});

    expect(response.status).toBe(401);
  });
});

describe('GET /ceremonies', () => {
  it('セレモニーの一覧を返す', async () => {
    const response = await request('/ceremonies');

    expect(response.status).toBe(200);
    const {ceremonies} = (await response.json()) as {
      ceremonies: Array<{uid: string}>;
    };
    expect(
      ceremonies
        .map(ceremony => ceremony.uid)
        .toSorted((a, b) => a.localeCompare(b)),
    ).toEqual(['c-2020', 'c-2021']);
  });
});

describe('GET /ceremonies/:ceremonyUid', () => {
  it('セレモニーの詳細を返す', async () => {
    const response = await request('/ceremonies/c-2020');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ceremony: {uid: 'c-2020', year: 2020},
    });
  });

  it('無ければ 404 を返す', async () => {
    const response = await request('/ceremonies/missing');

    expect(response.status).toBe(404);
  });
});

describe('POST /ceremonies', () => {
  it('作成して 201 と詳細を返す', async () => {
    const response = await request('/ceremonies', {
      method: 'POST',
      body: JSON.stringify({
        organizationUid: 'org',
        year: 2022,
        ceremonyNumber: 3,
      }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      ceremony: {year: 2022, ceremonyNumber: 3},
    });
  });

  it('入力が不正なら 400 を返す', async () => {
    const response = await request('/ceremonies', {
      method: 'POST',
      body: JSON.stringify({organizationUid: 'org', year: 'x'}),
    });

    expect(response.status).toBe(400);
  });

  it('主催団体が無ければ 404 を返す', async () => {
    const response = await request('/ceremonies', {
      method: 'POST',
      body: JSON.stringify({organizationUid: 'nope', year: 2022}),
    });

    expect(response.status).toBe(404);
  });

  it('同じ団体・年が既にあれば 409 を返す', async () => {
    const response = await request('/ceremonies', {
      method: 'POST',
      body: JSON.stringify({organizationUid: 'org', year: 2020}),
    });

    expect(response.status).toBe(409);
  });
});

describe('PUT /ceremonies/:ceremonyUid', () => {
  it('更新して詳細を返す', async () => {
    const response = await request('/ceremonies/c-2020', {
      method: 'PUT',
      body: JSON.stringify({
        organizationUid: 'org',
        year: 2020,
        ceremonyNumber: 1,
        location: 'Tokyo',
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ceremony: {uid: 'c-2020', location: 'Tokyo'},
    });
  });

  it('無ければ 404 を返す', async () => {
    const response = await request('/ceremonies/missing', {
      method: 'PUT',
      body: JSON.stringify({organizationUid: 'org', year: 2030}),
    });

    expect(response.status).toBe(404);
  });

  it('他のセレモニーと同じ年に変えようとすると 409 を返す', async () => {
    const response = await request('/ceremonies/c-2020', {
      method: 'PUT',
      body: JSON.stringify({organizationUid: 'org', year: 2021}),
    });

    expect(response.status).toBe(409);
  });
});

describe('DELETE /ceremonies/:ceremonyUid', () => {
  it('削除すると一覧から消える', async () => {
    const response = await request('/ceremonies/c-2020', {method: 'DELETE'});

    expect(response.status).toBe(200);
    const list = await request('/ceremonies');
    const {ceremonies} = (await list.json()) as {
      ceremonies: Array<{uid: string}>;
    };
    expect(ceremonies.map(ceremony => ceremony.uid)).toEqual(['c-2021']);
  });

  it('無ければ 404 を返す', async () => {
    const response = await request('/ceremonies/missing', {method: 'DELETE'});

    expect(response.status).toBe(404);
  });
});

describe('GET /awards', () => {
  it('団体・セレモニー・部門の参照データを返す', async () => {
    const response = await request('/awards');

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      organizations: Array<{uid: string}>;
      ceremonies: Array<{uid: string}>;
      categories: Array<{uid: string}>;
    };
    expect(body.organizations.map(o => o.uid)).toEqual(['org']);
    expect(body.ceremonies.map(c => c.uid)).toEqual(['c-2020', 'c-2021']);
    expect(body.categories.map(c => c.uid)).toEqual(['category']);
  });

  it('団体の略称を返す', async () => {
    const response = await request('/awards');

    const body = (await response.json()) as {
      organizations: Array<{uid: string; shortName: string | null}>;
    };
    expect(body.organizations[0]).toMatchObject({uid: 'org', shortName: 'ORG'});
  });
});

describe('GET /awards', () => {
  it('トークンが無ければ 401 を返す', async () => {
    const response = await request('/awards', {}, {});

    expect(response.status).toBe(401);
  });

  it('団体と部門の一覧を返す', async () => {
    const response = await request('/awards');

    expect(response.status).toBe(200);
    const reference = (await response.json()) as {
      organizations: Array<{uid: string}>;
    };
    expect(reference.organizations.map(entry => entry.uid)).toContain('org');
  });
});

describe('DB が読めないとき', () => {
  beforeEach(async () => {
    const empty = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-test-'));
    environment = {
      ...environment,
      TURSO_DATABASE_URL: `file:${path.join(empty, 'unmigrated.db')}`,
    };
  });

  const routes = [
    ['GET /ceremonies', '/ceremonies', {}],
    ['GET /ceremonies/:uid', '/ceremonies/c-2020', {}],
    ['GET /awards', '/awards', {}],
    ['DELETE /ceremonies/:uid', '/ceremonies/c-2020', {method: 'DELETE'}],
  ] as const;

  it.each(routes)('%s は 500 を返す', async (_name, route, init) => {
    const response = await request(route, init);

    expect(response.status).toBe(500);
  });
});
