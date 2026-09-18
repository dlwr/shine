import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {articleLinks} from '@shine/database/schema/article-links';
import {movieSelections} from '@shine/database/schema/movie-selections';
import {movies} from '@shine/database/schema/movies';
import {translations} from '@shine/database/schema/translations';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createJWT} from '../auth';
import {moviesRoutes} from '../routes/movies';
import {getSelectionDate} from '../services/selection-dates';

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

async function submit(
  body: SubmissionBody,
  headers: Record<string, string> = {},
): Promise<Response> {
  return moviesRoutes.request(
    '/movie-1/article-links',
    {
      method: 'POST',
      headers: {'Content-Type': 'application/json', ...headers},
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

async function storedSubmitterIp(): Promise<string | undefined> {
  const [row] = await getDatabase(environment)
    .select({submitterIp: articleLinks.submitterIp})
    .from(articleLinks);
  return row?.submitterIp ?? undefined;
}

async function storedIsOwnerSubmission(): Promise<boolean | undefined> {
  const [row] = await getDatabase(environment)
    .select({isOwnerSubmission: articleLinks.isOwnerSubmission})
    .from(articleLinks);
  return row?.isOwnerSubmission;
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
    const response = await submit({description: ' '.repeat(3)});

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

describe('投稿者の IP', () => {
  it('front が service binding 越しに渡した x-real-ip を記録する', async () => {
    await submit({description: 'よかった'}, {'x-real-ip': '203.0.113.9'});

    expect(await storedSubmitterIp()).toBe('203.0.113.9');
  });

  it('cf-connecting-ip があれば x-real-ip より優先する', async () => {
    await submit(
      {description: 'よかった'},
      {'cf-connecting-ip': '198.51.100.1', 'x-real-ip': '203.0.113.9'},
    );

    expect(await storedSubmitterIp()).toBe('198.51.100.1');
  });

  it('同じ IP からは 1 時間に 10 件までしか投稿できない', async () => {
    for (let index = 0; index < 10; index++) {
      await submit({description: `${index}`}, {'x-real-ip': '203.0.113.9'});
    }

    const response = await submit(
      {description: '11件目'},
      {'x-real-ip': '203.0.113.9'},
    );

    expect(response.status).toBe(429);
  });

  it('別の IP の投稿は他人の上限に巻き込まれない', async () => {
    for (let index = 0; index < 10; index++) {
      await submit({description: `${index}`}, {'x-real-ip': '203.0.113.9'});
    }

    const response = await submit(
      {description: '別の人'},
      {'x-real-ip': '203.0.113.10'},
    );

    expect(response.status).toBe(201);
  });
});

describe('本人の投稿の印', () => {
  beforeEach(() => {
    environment.JWT_SECRET = 'test-secret';
  });

  it('有効な admin トークン付きの投稿は本人の投稿として保存する', async () => {
    const token = await createJWT('test-secret');

    await submit({description: 'よかった'}, {Authorization: `Bearer ${token}`});

    expect(await storedIsOwnerSubmission()).toBe(true);
  });

  it('トークンが無い投稿は本人の投稿にしない', async () => {
    await submit({description: 'よかった'});

    expect(await storedIsOwnerSubmission()).toBe(false);
  });

  it('署名が合わないトークンは本人の投稿にしない', async () => {
    const token = await createJWT('other-secret');

    await submit({description: 'よかった'}, {Authorization: `Bearer ${token}`});

    expect(await storedIsOwnerSubmission()).toBe(false);
  });

  it('署名が合わないトークンでも投稿自体は受け付ける', async () => {
    const token = await createJWT('other-secret');

    const response = await submit(
      {description: 'よかった'},
      {Authorization: `Bearer ${token}`},
    );

    expect(response.status).toBe(201);
  });
});

describe('投稿の Discord 通知', () => {
  beforeEach(async () => {
    environment = await createTestEnvironment();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('Webhook が設定されていれば映画名つきで通知する', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ok: true} as Response);
    vi.stubGlobal('fetch', fetchMock);
    environment.DISCORD_WEBHOOK_URL = 'https://discord.test/hook';

    const response = await submit({description: 'よかった'});

    expect(response.status).toBe(201);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {content: string};
    expect(body.content).toContain('映画1');
    expect(body.content).toContain('よかった');
  });

  it('admin トークン付きの投稿は本人の投稿として通知する', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ok: true} as Response);
    vi.stubGlobal('fetch', fetchMock);
    environment.DISCORD_WEBHOOK_URL = 'https://discord.test/hook';
    environment.JWT_SECRET = 'test-secret';
    const token = await createJWT('test-secret');

    await submit(
      {url: 'https://open.spotify.com/episode/abc', title: 'ポッドキャスト'},
      {Authorization: `Bearer ${token}`},
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {content: string};
    expect(body.content).toContain('本人の投稿');
  });

  it('Webhook が無ければ通知しない', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await submit({description: 'よかった'});

    expect(response.status).toBe(201);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

async function selectAsMonthly(movieUid: string): Promise<void> {
  const database = getDatabase(environment);
  await database.insert(movieSelections).values({
    selectionType: 'monthly',
    selectionDate: getSelectionDate(new Date(), 'monthly'),
    movieId: movieUid,
  });
}

describe('今月の1本への他人の投稿', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('今月の1本なら GitHub の repository_dispatch を送る', async () => {
    await selectAsMonthly('movie-1');
    environment.GITHUB_DISPATCH_TOKEN = 'ghp_test';
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(undefined, {status: 204}));
    vi.stubGlobal('fetch', fetchMock);

    await submit({description: 'よかった'}, {'x-real-ip': '203.0.113.9'});

    const dispatchCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('/dispatches'),
    );
    expect(dispatchCall).toBeDefined();
    const [, init] = dispatchCall as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({
      event_type: 'monthly-link-posted',
      client_payload: {movieUid: 'movie-1'},
    });
  });

  it('今月の1本でなければ送らない', async () => {
    environment.GITHUB_DISPATCH_TOKEN = 'ghp_test';
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(undefined, {status: 204}));
    vi.stubGlobal('fetch', fetchMock);

    await submit({description: 'よかった'}, {'x-real-ip': '203.0.113.9'});

    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes('/dispatches')),
    ).toBe(false);
  });
});

async function insertLink(
  values: Partial<typeof articleLinks.$inferInsert> & {uid: string},
): Promise<void> {
  await getDatabase(environment)
    .insert(articleLinks)
    .values({movieUid: 'movie-1', description: values.uid, ...values});
}

async function listedUids(): Promise<string[]> {
  const response = await moviesRoutes.request(
    '/movie-1/article-links',
    {},
    environment,
  );
  expect(response.status).toBe(200);
  const links = (await response.json()) as Array<{uid: string}>;
  return links.map(link => link.uid);
}

describe('GET /movies/:id/article-links', () => {
  it('新しい投稿を先に返す', async () => {
    await insertLink({uid: 'old', submittedAt: new Date(1000 * 1000)});
    await insertLink({uid: 'newest', submittedAt: new Date(3000 * 1000)});
    await insertLink({uid: 'middle', submittedAt: new Date(2000 * 1000)});

    expect(await listedUids()).toEqual(['newest', 'middle', 'old']);
  });

  it('スパムと通報済みの投稿は返さない', async () => {
    await insertLink({uid: 'ok', submittedAt: new Date(3000 * 1000)});
    await insertLink({
      uid: 'spam',
      submittedAt: new Date(2000 * 1000),
      isSpam: true,
    });
    await insertLink({
      uid: 'flagged',
      submittedAt: new Date(1000 * 1000),
      isFlagged: true,
    });

    expect(await listedUids()).toEqual(['ok']);
  });

  it('他の映画の投稿は返さない', async () => {
    await getDatabase(environment)
      .insert(movies)
      .values({uid: 'movie-2', year: 2021});
    await insertLink({uid: 'mine', submittedAt: new Date(2000 * 1000)});
    await insertLink({
      uid: 'other',
      submittedAt: new Date(3000 * 1000),
      movieUid: 'movie-2',
    });

    expect(await listedUids()).toEqual(['mine']);
  });

  it('20 件までしか返さない', async () => {
    for (let index = 0; index < 21; index += 1) {
      await insertLink({
        uid: `link-${index}`,
        submittedAt: new Date(index * 1000),
      });
    }

    expect(await listedUids()).toHaveLength(20);
  });
});
