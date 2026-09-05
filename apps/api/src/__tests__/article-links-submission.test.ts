import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {movies} from '@shine/database/schema/movies';
import {translations} from '@shine/database/schema/translations';
import {beforeEach, describe, expect, it} from 'vitest';
import {moviesRoutes} from '../routes/movies';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

type SubmissionBody = {
  url?: string;
  title?: string;
  description?: string;
};

type MovieDetailResponse = {
  articleLinks: Array<{
    uid: string;
    url: string | undefined;
    title: string | undefined;
    description: string | undefined;
  }>;
};

let environment: Environment;

async function createTestEnvironment(): Promise<Environment> {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'shine-article-links-'),
  );
  const created = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
  } as Environment;
  const database = getDatabase(created);
  await migrate(database, {migrationsFolder});

  await database.insert(movies).values({uid: 'movie-1', year: 2020});
  await database.insert(translations).values({
    resourceType: 'movie_title',
    resourceUid: 'movie-1',
    languageCode: 'ja',
    content: '映画1',
    isDefault: 1,
  });

  return created;
}

async function submit(body: SubmissionBody): Promise<Response> {
  return moviesRoutes.request(
    '/movie-1/article-links',
    {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({...body, captchaToken: 'test-token'}),
    },
    environment,
  );
}

async function fetchArticleLinks(): Promise<
  MovieDetailResponse['articleLinks']
> {
  const response = await moviesRoutes.request(
    '/movie-1?locale=ja',
    {},
    environment,
  );
  const body = (await response.json()) as MovieDetailResponse;
  return body.articleLinks;
}

beforeEach(async () => {
  environment = await createTestEnvironment();
});

describe('POST /movies/:id/article-links', () => {
  it('URL 無しでひとことだけ投稿できる', async () => {
    const response = await submit({description: '音がすごかった'});

    expect(response.status).toBe(201);
  });

  it('ひとことだけの投稿は URL を持たない', async () => {
    await submit({description: '音がすごかった'});

    const links = await fetchArticleLinks();

    expect(links[0]?.url).toBeUndefined();
    expect(links[0]?.description).toBe('音がすごかった');
  });

  it('空白だけのひとことは投稿として受け付けない', async () => {
    const response = await submit({description: '   '});

    expect(response.status).toBe(400);
  });

  it('URL もひとことも無ければ 400 を返す', async () => {
    const response = await submit({});

    expect(response.status).toBe(400);
  });

  it('URL があってタイトルが無ければ 400 を返す', async () => {
    const response = await submit({url: 'https://example.com/article'});

    expect(response.status).toBe(400);
  });

  it('URL とタイトルの投稿は従来どおり受け付ける', async () => {
    const response = await submit({
      url: 'https://example.com/article',
      title: '感想',
    });

    expect(response.status).toBe(201);
  });

  it('ひとことが 500 字を超えたら 400 を返す', async () => {
    const response = await submit({description: 'あ'.repeat(501)});

    expect(response.status).toBe(400);
  });
});
