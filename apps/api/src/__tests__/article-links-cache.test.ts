import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {articleLinks} from '@shine/database/schema/article-links';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movieSelections} from '@shine/database/schema/movie-selections';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {translations} from '@shine/database/schema/translations';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {createJWT} from '../auth';
import {adminArticleLinksRoutes} from '../routes/admin/article-links';
import {moviesRoutes} from '../routes/movies';
import {selectionsRoutes} from '../routes/selections';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

const JWT_SECRET = 'test-jwt-secret';

type MovieDetailResponse = {
  articleLinks: Array<{uid: string; url: string; title: string}>;
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

function createStatefulCacheStub() {
  const store = new Map<string, Response>();
  return {
    async match(key: string) {
      return store.get(key)?.clone();
    },
    async put(key: string, response: Response) {
      store.set(key, response);
    },
    async delete(key: string) {
      return store.delete(key);
    },
    async keys() {
      return [...store.keys()].map(key => new Request(key));
    },
  } as unknown as Cache;
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
  await database.insert(translations).values([
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-1',
      languageCode: 'en',
      content: 'Movie One',
      isDefault: 1,
    },
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-1',
      languageCode: 'ja',
      content: '映画1',
      isDefault: 0,
    },
  ]);

  return environment;
}

async function submitArticleLink(
  environment: Environment,
  url = 'https://example.com/article',
): Promise<Response> {
  return moviesRoutes.request(
    '/movie-1/article-links',
    {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        url,
        title: 'Test Article',
        captchaToken: 'test-token',
      }),
    },
    environment,
  );
}

async function getMovieArticleLinks(
  environment: Environment,
  locale: string,
): Promise<string[]> {
  const response = await moviesRoutes.request(
    `/movie-1?locale=${locale}`,
    {},
    environment,
  );
  const body = (await response.json()) as MovieDetailResponse;
  return body.articleLinks.map(link => link.url);
}

function todayDateString(): string {
  const now = new Date();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

async function insertDailySelection(environment: Environment): Promise<void> {
  await getDatabase(environment).insert(movieSelections).values({
    selectionType: 'daily',
    selectionDate: todayDateString(),
    movieId: 'movie-1',
  });
}

async function getDailySelectionArticleLinks(
  environment: Environment,
): Promise<string[]> {
  const response = await selectionsRoutes.request(
    '/?locale=ja',
    {},
    environment,
  );
  const body = (await response.json()) as {
    daily: {articleLinks: Array<{url: string}>};
  };
  return body.daily.articleLinks.map(link => link.url);
}

describe('article links cache invalidation', () => {
  let environment: Environment;
  const originalCaches = caches;

  beforeEach(async () => {
    // eslint-disable-next-line unicorn/no-global-object-property-assignment -- cachesはnon-configurableでvi.stubGlobalが使えない
    (globalThis as {caches?: unknown}).caches = {
      default: createStatefulCacheStub(),
    };
    environment = await createTestEnvironment();
  });

  afterEach(() => {
    // eslint-disable-next-line unicorn/no-global-object-property-assignment -- 同上
    (globalThis as {caches?: unknown}).caches = originalCaches;
  });

  it('記事リンクを投稿すると201で保存される', async () => {
    const response = await submitArticleLink(environment);

    expect(response.status).toBe(201);
  });

  it('投稿後にjaロケールの映画詳細キャッシュが無効化される', async () => {
    expect(await getMovieArticleLinks(environment, 'ja')).toEqual([]);

    await submitArticleLink(environment);

    expect(await getMovieArticleLinks(environment, 'ja')).toContain(
      'https://example.com/article',
    );
  });

  it('投稿後にenロケールの映画詳細キャッシュが無効化される', async () => {
    expect(await getMovieArticleLinks(environment, 'en')).toEqual([]);

    await submitArticleLink(environment);

    expect(await getMovieArticleLinks(environment, 'en')).toContain(
      'https://example.com/article',
    );
  });

  it('admin削除後に映画詳細キャッシュが無効化される', async () => {
    await submitArticleLink(environment);
    const [article] = await getDatabase(environment)
      .select({uid: articleLinks.uid})
      .from(articleLinks);
    expect(await getMovieArticleLinks(environment, 'ja')).toContain(
      'https://example.com/article',
    );

    const token = await createJWT(JWT_SECRET);
    const response = await adminArticleLinksRoutes.request(
      `/article-links/${article.uid}`,
      {
        method: 'DELETE',
        headers: {Authorization: `Bearer ${token}`},
      },
      environment,
    );
    expect(response.status).toBe(200);

    expect(await getMovieArticleLinks(environment, 'ja')).toEqual([]);
  });

  it('投稿後に当日のselectionsキャッシュが無効化される', async () => {
    await insertDailySelection(environment);
    expect(await getDailySelectionArticleLinks(environment)).toEqual([]);

    await submitArticleLink(environment);

    expect(await getDailySelectionArticleLinks(environment)).toContain(
      'https://example.com/article',
    );
  });

  it('admin削除後に当日のselectionsキャッシュが無効化される', async () => {
    await insertDailySelection(environment);
    await submitArticleLink(environment);
    const [article] = await getDatabase(environment)
      .select({uid: articleLinks.uid})
      .from(articleLinks);
    expect(await getDailySelectionArticleLinks(environment)).toContain(
      'https://example.com/article',
    );

    const token = await createJWT(JWT_SECRET);
    await adminArticleLinksRoutes.request(
      `/article-links/${article.uid}`,
      {
        method: 'DELETE',
        headers: {Authorization: `Bearer ${token}`},
      },
      environment,
    );

    expect(await getDailySelectionArticleLinks(environment)).toEqual([]);
  });

  it('adminスパム報告後に映画詳細キャッシュが無効化される', async () => {
    await submitArticleLink(environment);
    const [article] = await getDatabase(environment)
      .select({uid: articleLinks.uid})
      .from(articleLinks);
    expect(await getMovieArticleLinks(environment, 'ja')).toContain(
      'https://example.com/article',
    );

    const token = await createJWT(JWT_SECRET);
    const response = await adminArticleLinksRoutes.request(
      `/article-links/${article.uid}/spam`,
      {
        method: 'POST',
        headers: {Authorization: `Bearer ${token}`},
      },
      environment,
    );
    expect(response.status).toBe(200);

    expect(await getMovieArticleLinks(environment, 'ja')).toEqual([]);
  });
});

async function insertArticleLinkDirectly(
  environment: Environment,
): Promise<void> {
  await getDatabase(environment).insert(articleLinks).values({
    movieUid: 'movie-1',
    url: 'https://example.com/article',
    title: 'Test Article',
    submitterIp: 'test-ip',
  });
}

describe('article links cache invalidation (CACHE_KV)', () => {
  let environment: Environment;

  beforeEach(async () => {
    environment = await createTestEnvironment();
    environment.CACHE_KV = createKvStub();
  });

  it('映画詳細がKVにキャッシュされる', async () => {
    expect(await getMovieArticleLinks(environment, 'ja')).toEqual([]);

    await insertArticleLinkDirectly(environment);

    expect(await getMovieArticleLinks(environment, 'ja')).toEqual([]);
  });

  it('投稿後にKV上の映画詳細キャッシュが無効化される', async () => {
    expect(await getMovieArticleLinks(environment, 'ja')).toEqual([]);

    await submitArticleLink(environment);

    expect(await getMovieArticleLinks(environment, 'ja')).toContain(
      'https://example.com/article',
    );
  });

  it('selectionsがKVにキャッシュされる', async () => {
    await insertDailySelection(environment);
    expect(await getDailySelectionArticleLinks(environment)).toEqual([]);

    await insertArticleLinkDirectly(environment);

    expect(await getDailySelectionArticleLinks(environment)).toEqual([]);
  });

  it('投稿後にKV上のselectionsキャッシュが無効化される', async () => {
    await insertDailySelection(environment);
    expect(await getDailySelectionArticleLinks(environment)).toEqual([]);

    await submitArticleLink(environment);

    expect(await getDailySelectionArticleLinks(environment)).toContain(
      'https://example.com/article',
    );
  });
});
