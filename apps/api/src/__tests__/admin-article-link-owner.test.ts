import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {eq, getDatabase, type Environment} from '@shine/database';
import {articleLinks} from '@shine/database/schema/article-links';
import {movies} from '@shine/database/schema/movies';
import {migrate} from '@shine/database/testing';
import {beforeEach, describe, expect, it} from 'vitest';
import {createJWT} from '../auth';
import {adminArticleLinksRoutes} from '../routes/admin/article-links';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

const JWT_SECRET = 'test-jwt-secret';

let environment: Environment;

beforeEach(async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'shine-article-link-owner-'),
  );
  environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
    JWT_SECRET,
  } as Environment;
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});
  await database.insert(movies).values({uid: 'movie-1', year: 2020});
  await database.insert(articleLinks).values({
    uid: 'link-1',
    movieUid: 'movie-1',
    url: 'https://open.spotify.com/episode/abc',
    title: 'ポッドキャスト',
    submitterIp: '203.0.113.9',
  });
});

async function setOwner(
  linkUid: string,
  isOwnerSubmission: boolean,
  headers: Record<string, string>,
): Promise<Response> {
  return adminArticleLinksRoutes.request(
    `/article-links/${linkUid}/owner`,
    {
      method: 'PUT',
      headers: {'Content-Type': 'application/json', ...headers},
      body: JSON.stringify({isOwnerSubmission}),
    },
    environment,
  );
}

async function authorization(): Promise<Record<string, string>> {
  return {Authorization: `Bearer ${await createJWT(JWT_SECRET)}`};
}

async function storedIsOwnerSubmission(): Promise<boolean | undefined> {
  const [row] = await getDatabase(environment)
    .select({isOwnerSubmission: articleLinks.isOwnerSubmission})
    .from(articleLinks)
    .where(eq(articleLinks.uid, 'link-1'));
  return row?.isOwnerSubmission;
}

describe('PUT /admin/article-links/:id/owner', () => {
  it('投稿に本人の印を付ける', async () => {
    await setOwner('link-1', true, await authorization());

    expect(await storedIsOwnerSubmission()).toBe(true);
  });

  it('付けた本人の印を外せる', async () => {
    await setOwner('link-1', true, await authorization());
    await setOwner('link-1', false, await authorization());

    expect(await storedIsOwnerSubmission()).toBe(false);
  });

  it('存在しない投稿には 404 を返す', async () => {
    const response = await setOwner('missing', true, await authorization());

    expect(response.status).toBe(404);
  });

  it('真偽値以外は 400 を返す', async () => {
    const response = await adminArticleLinksRoutes.request(
      '/article-links/link-1/owner',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(await authorization()),
        },
        body: JSON.stringify({isOwnerSubmission: 'yes'}),
      },
      environment,
    );

    expect(response.status).toBe(400);
  });

  it('トークンが無ければ 401 を返す', async () => {
    const response = await setOwner('link-1', true, {});

    expect(response.status).toBe(401);
  });
});
