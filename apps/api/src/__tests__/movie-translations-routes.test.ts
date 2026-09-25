import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {and, eq, getDatabase, type Environment} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {translations} from '@shine/database/schema/translations';
import {migrate} from '@shine/database/testing';
import {beforeEach, describe, expect, it} from 'vitest';
import {createJWT} from '../auth';
import {movieTranslationsRoutes} from '../routes/movies/translations';

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

async function titlesOf(movieUid: string) {
  return database
    .select({
      languageCode: translations.languageCode,
      content: translations.content,
      isDefault: translations.isDefault,
    })
    .from(translations)
    .where(
      and(
        eq(translations.resourceUid, movieUid),
        eq(translations.resourceType, 'movie_title'),
      ),
    );
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
  await database.insert(translations).values({
    uid: 'translation-en',
    resourceType: 'movie_title',
    resourceUid: 'movie-1',
    languageCode: 'en',
    content: 'Original Title',
    isDefault: 1,
  });

  authHeaders = {
    Authorization: `Bearer ${await createJWT(JWT_SECRET)}`,
    'Content-Type': 'application/json',
  };
});

async function postTranslation(body: unknown, movieUid = 'movie-1') {
  return movieTranslationsRoutes.request(
    `/${movieUid}/translations`,
    {method: 'POST', headers: authHeaders, body: JSON.stringify(body)},
    environment,
  );
}

describe('POST /:id/translations', () => {
  it('トークンが無ければ 401 を返す', async () => {
    const response = await movieTranslationsRoutes.request(
      '/movie-1/translations',
      {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({languageCode: 'ja', content: '邦題'}),
      },
      environment,
    );

    expect(response.status).toBe(401);
  });

  it('邦題を足す', async () => {
    const response = await postTranslation({
      languageCode: 'ja',
      content: '邦題',
    });

    expect(response.status).toBe(200);
    expect(await titlesOf('movie-1')).toContainEqual({
      languageCode: 'ja',
      content: '邦題',
      isDefault: 0,
    });
  });

  it('既定に指定すると他の言語の既定を外す', async () => {
    await postTranslation({
      languageCode: 'ja',
      content: '邦題',
      isDefault: true,
    });

    const rows = await titlesOf('movie-1');
    expect(rows.filter(row => row.isDefault === 1)).toStrictEqual([
      {languageCode: 'ja', content: '邦題', isDefault: 1},
    ]);
  });

  it('タグを含む題名は除去して保存する', async () => {
    await postTranslation({
      languageCode: 'ja',
      content: '<script>alert(1)</script>邦題',
    });

    const rows = await titlesOf('movie-1');
    const japanese = rows.find(title => title.languageCode === 'ja');
    expect(japanese?.content).not.toContain('<script>');
  });

  it('言語と題名が無ければ 400 を返す', async () => {
    const response = await postTranslation({languageCode: 'ja'});

    expect(response.status).toBe(400);
  });

  it('言語コードが 2 文字でなければ 400 を返す', async () => {
    const response = await postTranslation({
      languageCode: 'jpn',
      content: '邦題',
    });

    expect(response.status).toBe(400);
  });

  it('映画が無ければ 404 を返す', async () => {
    const response = await postTranslation(
      {languageCode: 'ja', content: '邦題'},
      'movie-missing',
    );

    expect(response.status).toBe(404);
  });

  it('論理削除された映画には足せない', async () => {
    const response = await postTranslation(
      {languageCode: 'ja', content: '邦題'},
      'movie-deleted',
    );

    expect(response.status).toBe(404);
  });
});

describe('DELETE /:id/translations/:lang', () => {
  it('トークンが無ければ 401 を返す', async () => {
    const response = await movieTranslationsRoutes.request(
      '/movie-1/translations/en',
      {method: 'DELETE'},
      environment,
    );

    expect(response.status).toBe(401);
  });

  it('その言語の題名を消す', async () => {
    const response = await movieTranslationsRoutes.request(
      '/movie-1/translations/en',
      {method: 'DELETE', headers: authHeaders},
      environment,
    );

    expect(response.status).toBe(200);
    expect(await titlesOf('movie-1')).toHaveLength(0);
  });

  it('他の言語の題名は残す', async () => {
    await postTranslation({languageCode: 'ja', content: '邦題'});

    await movieTranslationsRoutes.request(
      '/movie-1/translations/en',
      {method: 'DELETE', headers: authHeaders},
      environment,
    );

    expect(await titlesOf('movie-1')).toStrictEqual([
      {languageCode: 'ja', content: '邦題', isDefault: 0},
    ]);
  });
});
