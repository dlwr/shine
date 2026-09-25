import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {eq, getDatabase, type Environment} from '@shine/database';
import {articleLinks} from '@shine/database/schema/article-links';
import {movies} from '@shine/database/schema/movies';
import {migrate} from '@shine/database/testing';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {createJWT} from '../auth';
import {adminArticleLinksRoutes} from '../routes/admin/article-links';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

const JWT_SECRET = 'test-jwt-secret';

let environment: Environment;
let database: ReturnType<typeof getDatabase>;
let authHeaders: Record<string, string>;
let deletedCacheKeys: string[];

function createKvStub(): KVNamespace {
  return {
    async get() {
      return null;
    },
    async put() {},
    async delete(key: string) {
      deletedCacheKeys.push(key);
    },
  } as unknown as KVNamespace;
}

async function flagAsSpam(linkUid: string) {
  return adminArticleLinksRoutes.request(
    `/article-links/${linkUid}/spam`,
    {method: 'POST', headers: authHeaders},
    environment,
  );
}

async function deleteLink(linkUid: string) {
  return adminArticleLinksRoutes.request(
    `/article-links/${linkUid}`,
    {method: 'DELETE', headers: authHeaders},
    environment,
  );
}

beforeEach(async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-test-'));
  deletedCacheKeys = [];
  environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
    JWT_SECRET,
    CACHE_KV: createKvStub(),
  } as Environment;
  database = getDatabase(environment);
  await migrate(database, {migrationsFolder});
  await database.insert(movies).values({uid: 'movie-1', year: 2020});
  await database.insert(articleLinks).values({
    uid: 'link-1',
    movieUid: 'movie-1',
    url: 'https://example.com/review',
    title: '感想',
    submitterIp: '203.0.113.9',
  });
  authHeaders = {
    Authorization: `Bearer ${await createJWT(JWT_SECRET)}`,
    'Content-Type': 'application/json',
  };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /article-links/:id/spam', () => {
  it('トークンが無ければ 401 を返す', async () => {
    const response = await adminArticleLinksRoutes.request(
      '/article-links/link-1/spam',
      {method: 'POST'},
      environment,
    );

    expect(response.status).toBe(401);
  });

  it('spam の印を付ける', async () => {
    const response = await flagAsSpam('link-1');

    expect(response.status).toBe(200);
    const [link] = await database
      .select({isSpam: articleLinks.isSpam})
      .from(articleLinks)
      .where(eq(articleLinks.uid, 'link-1'));
    expect(link.isSpam).toBe(true);
  });

  it('spam にしたら映画のキャッシュを消す', async () => {
    await flagAsSpam('link-1');

    expect(deletedCacheKeys.length).toBeGreaterThan(0);
  });

  it('存在しない投稿でもキャッシュを消さずに成功を返す', async () => {
    const response = await flagAsSpam('link-missing');

    expect(response.status).toBe(200);
    expect(deletedCacheKeys).toEqual([]);
  });

  it('保存に失敗したら 500 を返す', async () => {
    const empty = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-test-'));
    environment = {
      ...environment,
      TURSO_DATABASE_URL: `file:${path.join(empty, 'unmigrated.db')}`,
    } as Environment;

    const response = await flagAsSpam('link-1');

    expect(response.status).toBe(500);
  });
});

describe('DELETE /article-links/:id', () => {
  it('トークンが無ければ 401 を返す', async () => {
    const response = await adminArticleLinksRoutes.request(
      '/article-links/link-1',
      {method: 'DELETE'},
      environment,
    );

    expect(response.status).toBe(401);
  });

  it('投稿を消す', async () => {
    const response = await deleteLink('link-1');

    expect(response.status).toBe(200);
    const remaining = await database
      .select({uid: articleLinks.uid})
      .from(articleLinks);
    expect(remaining).toEqual([]);
  });

  it('消したら映画のキャッシュを消す', async () => {
    await deleteLink('link-1');

    expect(deletedCacheKeys.length).toBeGreaterThan(0);
  });

  it('存在しない投稿でもキャッシュを消さずに成功を返す', async () => {
    const response = await deleteLink('link-missing');

    expect(response.status).toBe(200);
    expect(deletedCacheKeys).toEqual([]);
  });

  it('削除に失敗したら 500 を返す', async () => {
    const empty = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-test-'));
    environment = {
      ...environment,
      TURSO_DATABASE_URL: `file:${path.join(empty, 'unmigrated.db')}`,
    } as Environment;

    const response = await deleteLink('link-1');

    expect(response.status).toBe(500);
  });
});
