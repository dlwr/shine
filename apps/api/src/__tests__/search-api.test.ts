import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {movieCredits} from '@shine/database/schema/movie-credits';
import {movies} from '@shine/database/schema/movies';
import {people} from '@shine/database/schema/people';
import {translations} from '@shine/database/schema/translations';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {beforeEach, describe, expect, it} from 'vitest';
import {searchRoutes} from '../routes/search';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

type SuggestResponse = {
  movies: Array<{uid: string; title: string; year?: number}>;
  people: Array<{uid: string; name: string}>;
};

async function createTestEnvironment(): Promise<Environment> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-suggest-'));
  const environment: Environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});

  await database.insert(movies).values({uid: 'movie-seven', year: 1954});
  await database.insert(translations).values({
    resourceType: 'movie_title',
    resourceUid: 'movie-seven',
    languageCode: 'ja',
    content: '七人の侍',
    isDefault: 1,
  });
  await database
    .insert(people)
    .values({uid: 'person-kurosawa', tmdbId: 5026, name: '黒澤明'});
  await database.insert(movieCredits).values({
    movieUid: 'movie-seven',
    personUid: 'person-kurosawa',
    creditId: 'c1',
    department: 'Directing',
    job: 'Director',
  });

  return environment;
}

async function suggest(
  environment: Environment,
  query: string,
): Promise<SuggestResponse> {
  const response = await searchRoutes.request(
    `/suggest?q=${encodeURIComponent(query)}`,
    {},
    environment,
  );
  expect(response.status).toBe(200);
  return (await response.json()) as SuggestResponse;
}

describe('GET /search/suggest', () => {
  let environment: Environment;

  beforeEach(async () => {
    environment = await createTestEnvironment();
  });

  it('タイトルに一致する映画を返す', async () => {
    const body = await suggest(environment, '七人');

    expect(body.movies).toEqual([
      {uid: 'movie-seven', title: '七人の侍', year: 1954},
    ]);
  });

  it('名前に一致する人物を返す', async () => {
    const body = await suggest(environment, '黒澤');

    expect(body.people.map(person => person.name)).toEqual(['黒澤明']);
  });

  it('一致しなければ空の配列を返す', async () => {
    const body = await suggest(environment, 'nobody');

    expect(body).toEqual({movies: [], people: []});
  });

  it('2文字未満の検索語には何も返さない', async () => {
    const body = await suggest(environment, '七');

    expect(body).toEqual({movies: [], people: []});
  });

  it('検索語が無ければ何も返さない', async () => {
    const response = await searchRoutes.request('/suggest', {}, environment);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({movies: [], people: []});
  });
});

describe('GET /search/suggest レート制限', () => {
  let environment: Environment;

  beforeEach(async () => {
    environment = await createTestEnvironment();
  });

  it('レート制限を超えたら429を返す', async () => {
    environment.SUGGEST_RATE_LIMITER = {
      async limit() {
        return {success: false};
      },
    };

    const response = await searchRoutes.request(
      '/suggest?q=%E4%B8%83%E4%BA%BA',
      {},
      environment,
    );

    expect(response.status).toBe(429);
  });

  it('レート制限内なら結果を返す', async () => {
    environment.SUGGEST_RATE_LIMITER = {
      async limit() {
        return {success: true};
      },
    };

    const body = await suggest(environment, '七人');

    expect(body.movies.map(movie => movie.uid)).toEqual(['movie-seven']);
  });

  it('クライアントIPをキーにする', async () => {
    const keys: string[] = [];
    environment.SUGGEST_RATE_LIMITER = {
      async limit({key}) {
        keys.push(key);
        return {success: true};
      },
    };

    await searchRoutes.request(
      '/suggest?q=%E4%B8%83%E4%BA%BA',
      {headers: {'cf-connecting-ip': '203.0.113.7'}},
      environment,
    );

    expect(keys).toEqual(['203.0.113.7']);
  });
});
