import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {migrate} from '@shine/database/testing';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {createJWT} from '../auth';
import {adminMovieMergeRoutes} from '../routes/admin/movie-merge';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

const JWT_SECRET = 'test-jwt-secret';

let environment: Environment;
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

async function merge(sourceId: string, targetId: string) {
  return adminMovieMergeRoutes.request(
    `/movies/${sourceId}/merge/${targetId}`,
    {method: 'POST', headers: authHeaders},
    environment,
  );
}

beforeEach(async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-test-'));
  environment = {
    DATABASE_FILE_URL: `file:${path.join(directory, 'test.db')}`,
    JWT_SECRET,
    CACHE_KV: createKvStub(),
  } as Environment;
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});
  await database.insert(movies).values([
    {uid: 'movie-source', year: 1967},
    {uid: 'movie-target', year: 1967},
  ]);
  authHeaders = {
    Authorization: `Bearer ${await createJWT(JWT_SECRET)}`,
    'Content-Type': 'application/json',
  };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /movies/:sourceId/merge/:targetId', () => {
  it('トークンが無ければ 401 を返す', async () => {
    const response = await adminMovieMergeRoutes.request(
      '/movies/movie-source/merge/movie-target',
      {method: 'POST'},
      environment,
    );

    expect(response.status).toBe(401);
  });

  it('統合できたら success を返す', async () => {
    const response = await merge('movie-source', 'movie-target');

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({success: true});
  });

  it('統合元と統合先が同じなら 400 を返す', async () => {
    const response = await merge('movie-source', 'movie-source');

    expect(response.status).toBe(400);
  });

  it('統合元が無ければ 404 を返す', async () => {
    const response = await merge('movie-missing', 'movie-target');

    expect(response.status).toBe(404);
  });

  it('統合先が無ければ 404 を返す', async () => {
    const response = await merge('movie-source', 'movie-missing');

    expect(response.status).toBe(404);
  });

  it('統合の途中で落ちたら理由を添えて 500 を返す', async () => {
    const empty = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-test-'));
    environment = {
      ...environment,
      DATABASE_FILE_URL: `file:${path.join(empty, 'unmigrated.db')}`,
    } as Environment;

    const response = await merge('movie-source', 'movie-target');

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: 'Internal server error',
      details: expect.stringContaining('movies'),
    });
  });
});
