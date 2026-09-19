import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {eq, getDatabase, type Environment} from '@shine/database';
import {movieSelections} from '@shine/database/schema/movie-selections';
import {articleLinks} from '@shine/database/schema/article-links';
import {movies} from '@shine/database/schema/movies';
import {posterUrls} from '@shine/database/schema/poster-urls';
import {translations} from '@shine/database/schema/translations';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {beforeEach, describe, expect, it} from 'vitest';
import {selectionsRoutes} from '../routes/selections';
import {getSelectionDate} from '../services/selection-dates';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

type HistoryItem = {
  uid: string;
  title: string;
  year: number | undefined;
  selectionDate: string;
  posterUrl: string | undefined;
  articleLinkCount: number;
};

type HistoryResponse = {items: HistoryItem[]};

function toDateString(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return `${date.getFullYear()}-${(date.getMonth() + 1)
    .toString()
    .padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
}

function toWeeklyDateString(weeksAgo: number): string {
  const date = new Date();
  const daysSinceFriday = (date.getDay() - 5 + 7) % 7;
  return toDateString(daysSinceFriday + weeksAgo * 7);
}

function toMonthlyDateString(monthsAgo: number): string {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() - monthsAgo);
  return `${date.getFullYear()}-${(date.getMonth() + 1)
    .toString()
    .padStart(2, '0')}-01`;
}

async function createTestEnvironment(): Promise<Environment> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-test-'));
  const environment: Environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});

  const movieRows = [
    {uid: 'movie-1', year: 2001},
    {uid: 'movie-2', year: 2002},
    {uid: 'movie-3', year: 2003},
  ];
  await database.insert(movies).values(movieRows);

  await database.insert(translations).values([
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-1',
      languageCode: 'ja',
      content: '映画その1',
    },
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-1',
      languageCode: 'en',
      content: 'Movie One',
      isDefault: 1,
    },
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-2',
      languageCode: 'en',
      content: 'Movie Two',
      isDefault: 1,
    },
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-3',
      languageCode: 'ja',
      content: '映画その3',
    },
  ]);

  await database.insert(movieSelections).values([
    {
      selectionType: 'daily',
      selectionDate: toDateString(0),
      movieId: 'movie-1',
    },
    {
      selectionType: 'daily',
      selectionDate: toDateString(1),
      movieId: 'movie-2',
    },
    {
      selectionType: 'daily',
      selectionDate: toDateString(2),
      movieId: 'movie-3',
    },
    {
      selectionType: 'weekly',
      selectionDate: toWeeklyDateString(0),
      movieId: 'movie-2',
    },
    {
      selectionType: 'weekly',
      selectionDate: toWeeklyDateString(1),
      movieId: 'movie-1',
    },
    {
      selectionType: 'weekly',
      selectionDate: toWeeklyDateString(2),
      movieId: 'movie-3',
    },
    {
      selectionType: 'monthly',
      selectionDate: toMonthlyDateString(0),
      movieId: 'movie-3',
    },
    {
      selectionType: 'monthly',
      selectionDate: toMonthlyDateString(1),
      movieId: 'movie-2',
    },
    {
      selectionType: 'monthly',
      selectionDate: toMonthlyDateString(2),
      movieId: 'movie-1',
    },
  ]);

  return environment;
}

describe('GET /selections/daily/history', () => {
  let environment: Environment;

  beforeEach(async () => {
    environment = await createTestEnvironment();
  });

  it('日次セレクションを日付の新しい順に返す', async () => {
    const response = await selectionsRoutes.request(
      '/selections/daily/history?locale=ja',
      {},
      environment,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as HistoryResponse;
    expect(body.items.map(item => item.selectionDate)).toEqual([
      toDateString(0),
      toDateString(1),
      toDateString(2),
    ]);
  });

  it('localeのタイトルを返し、無ければデフォルトにフォールバックする', async () => {
    const response = await selectionsRoutes.request(
      '/selections/daily/history?locale=ja',
      {},
      environment,
    );

    const body = (await response.json()) as HistoryResponse;
    const titles = Object.fromEntries(
      body.items.map(item => [item.uid, item.title]),
    );
    expect(titles['movie-1']).toBe('映画その1');
    expect(titles['movie-2']).toBe('Movie Two');
  });

  it('未来の日付のセレクションは含めない', async () => {
    const database = getDatabase(environment);
    await database.insert(movieSelections).values({
      selectionType: 'daily',
      selectionDate: toDateString(-1),
      movieId: 'movie-2',
    });

    const response = await selectionsRoutes.request(
      '/selections/daily/history',
      {},
      environment,
    );

    const body = (await response.json()) as HistoryResponse;
    expect(
      body.items.every(item => item.selectionDate <= toDateString(0)),
    ).toBe(true);
  });

  it('limitで件数を絞れる', async () => {
    const response = await selectionsRoutes.request(
      '/selections/daily/history?limit=2',
      {},
      environment,
    );

    const body = (await response.json()) as HistoryResponse;
    expect(body.items).toHaveLength(2);
  });

  it('削除済みの映画は含めない', async () => {
    const database = getDatabase(environment);
    await database
      .update(movies)
      .set({deletedAt: Math.floor(Date.now() / 1000)})
      .where(eq(movies.uid, 'movie-2'));

    const response = await selectionsRoutes.request(
      '/selections/daily/history',
      {},
      environment,
    );

    const body = (await response.json()) as HistoryResponse;
    expect(body.items.map(item => item.uid)).toEqual(['movie-1', 'movie-3']);
  });
});

describe('GET /selections/:type/history のポスターと関連リンク数', () => {
  let environment: Environment;

  async function fetchItem(uid: string): Promise<HistoryItem | undefined> {
    const response = await selectionsRoutes.request(
      '/selections/monthly/history?locale=ja',
      {},
      environment,
    );
    const body = (await response.json()) as HistoryResponse;
    return body.items.find(item => item.uid === uid);
  }

  beforeEach(async () => {
    environment = await createTestEnvironment();
    const database = getDatabase(environment);
    await database.insert(posterUrls).values([
      {movieUid: 'movie-3', url: 'https://img.test/old.jpg', createdAt: 1},
      {
        movieUid: 'movie-3',
        url: 'https://img.test/primary.jpg',
        isPrimary: 1,
        createdAt: 2,
      },
    ]);
    await database.insert(articleLinks).values([
      {movieUid: 'movie-3', url: 'https://a.test/1', title: 'a'},
      {movieUid: 'movie-3', description: 'ひとこと'},
      {movieUid: 'movie-3', url: 'https://a.test/spam', title: 's', isSpam: true},
      {
        movieUid: 'movie-3',
        url: 'https://a.test/flagged',
        title: 'f',
        isFlagged: true,
      },
    ]);
  });

  it('primary のポスターを返す', async () => {
    const item = await fetchItem('movie-3');
    expect(item?.posterUrl).toBe('https://img.test/primary.jpg');
  });

  it('ポスターが無い映画は posterUrl を持たない', async () => {
    const item = await fetchItem('movie-2');
    expect(item?.posterUrl).toBeUndefined();
  });

  it('スパムと報告済みを除いた関連リンクの数を返す', async () => {
    const item = await fetchItem('movie-3');
    expect(item?.articleLinkCount).toBe(2);
  });

  it('関連リンクが無い映画は 0 を返す', async () => {
    const item = await fetchItem('movie-2');
    expect(item?.articleLinkCount).toBe(0);
  });
});

describe('GET /selections/weekly/history', () => {
  let environment: Environment;

  beforeEach(async () => {
    environment = await createTestEnvironment();
  });

  it('週次セレクションを日付の新しい順に返す', async () => {
    const response = await selectionsRoutes.request(
      '/selections/weekly/history?locale=ja',
      {},
      environment,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as HistoryResponse;
    expect(body.items.map(item => item.selectionDate)).toEqual([
      toWeeklyDateString(0),
      toWeeklyDateString(1),
      toWeeklyDateString(2),
    ]);
  });

  it('来週以降のセレクションは含めない', async () => {
    const database = getDatabase(environment);
    await database.insert(movieSelections).values({
      selectionType: 'weekly',
      selectionDate: toWeeklyDateString(-1),
      movieId: 'movie-1',
    });

    const response = await selectionsRoutes.request(
      '/selections/weekly/history',
      {},
      environment,
    );

    const body = (await response.json()) as HistoryResponse;
    expect(
      body.items.every(item => item.selectionDate <= toWeeklyDateString(0)),
    ).toBe(true);
  });
});

describe('GET /selections/monthly/history', () => {
  let environment: Environment;

  beforeEach(async () => {
    environment = await createTestEnvironment();
  });

  it('月次セレクションを日付の新しい順に返す', async () => {
    const response = await selectionsRoutes.request(
      '/selections/monthly/history?locale=ja',
      {},
      environment,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as HistoryResponse;
    expect(body.items.map(item => item.selectionDate)).toEqual([
      toMonthlyDateString(0),
      toMonthlyDateString(1),
      toMonthlyDateString(2),
    ]);
  });

  it('来月以降のセレクションは含めない', async () => {
    const database = getDatabase(environment);
    await database.insert(movieSelections).values({
      selectionType: 'monthly',
      selectionDate: toMonthlyDateString(-1),
      movieId: 'movie-1',
    });

    const response = await selectionsRoutes.request(
      '/selections/monthly/history',
      {},
      environment,
    );

    const body = (await response.json()) as HistoryResponse;
    expect(
      body.items.every(item => item.selectionDate <= toMonthlyDateString(0)),
    ).toBe(true);
  });
});

describe('GET /selections/:type/history のキャッシュ', () => {
  type Put = {key: string; ttl: number | undefined};

  function createKv(store: Map<string, string>, puts: Put[]): KVNamespace {
    return {
      async get(key: string) {
        const raw = store.get(key);
        return raw === undefined ? null : JSON.parse(raw);
      },
      async put(
        key: string,
        value: string,
        options?: {expirationTtl?: number},
      ) {
        store.set(key, value);
        puts.push({key, ttl: options?.expirationTtl});
      },
      async delete(key: string) {
        store.delete(key);
      },
    } as unknown as KVNamespace;
  }

  let environment: Environment;
  let puts: Put[];

  beforeEach(async () => {
    environment = await createTestEnvironment();
    puts = [];
    environment.CACHE_KV = createKv(new Map(), puts);
  });

  it('鍵は type・locale・期間の日付だけで決まり、limit を含めない', async () => {
    await selectionsRoutes.request(
      '/selections/daily/history?locale=ja&limit=30',
      {},
      environment,
    );

    expect(puts.map(put => put.key)).toEqual([
      `selections:history:daily:${getSelectionDate(new Date(), 'daily')}:ja:v4`,
    ]);
  });

  it('limit が違っても同じキャッシュを読み、件数だけ絞る', async () => {
    await selectionsRoutes.request(
      '/selections/daily/history?locale=ja&limit=30',
      {},
      environment,
    );
    const response = await selectionsRoutes.request(
      '/selections/daily/history?locale=ja&limit=2',
      {},
      environment,
    );

    expect(response.headers.get('X-Cache-Status')).toBe('HIT');
    const body = (await response.json()) as HistoryResponse;
    expect(body.items).toHaveLength(2);
    expect(puts).toHaveLength(1);
  });

  it('期間の日付が鍵に入るので値は 7 日残す', async () => {
    await selectionsRoutes.request(
      '/selections/weekly/history?locale=en',
      {},
      environment,
    );

    expect(puts).toEqual([
      {
        key: `selections:history:weekly:${getSelectionDate(new Date(), 'weekly')}:en:v4`,
        ttl: 604_800,
      },
    ]);
  });
});

describe('GET /selections/:type/history のtype検証', () => {
  let environment: Environment;

  beforeEach(async () => {
    environment = await createTestEnvironment();
  });

  it('不正なtypeは400を返す', async () => {
    const response = await selectionsRoutes.request(
      '/selections/yearly/history',
      {},
      environment,
    );

    expect(response.status).toBe(400);
  });
});
