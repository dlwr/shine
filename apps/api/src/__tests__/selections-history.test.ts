import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {eq, getDatabase, type Environment} from '@shine/database';
import {movieSelections} from '@shine/database/schema/movie-selections';
import {movies} from '@shine/database/schema/movies';
import {translations} from '@shine/database/schema/translations';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {beforeEach, describe, expect, it} from 'vitest';
import {selectionsRoutes} from '../routes/selections';

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
};

type HistoryResponse = {items: HistoryItem[]};

function toDateString(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return `${date.getFullYear()}-${(date.getMonth() + 1)
    .toString()
    .padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
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
      selectionDate: toDateString(0),
      movieId: 'movie-2',
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
