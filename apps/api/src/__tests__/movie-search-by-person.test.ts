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
import {moviesRoutes} from '../routes/movies';

function byCodePoint(a: string, b: string): number {
  return a < b ? -1 : 1;
}

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

type SearchResponse = {
  movies: Array<{uid: string; title: string}>;
  pagination: {totalCount: number};
};

async function createTestEnvironment(): Promise<Environment> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-test-'));
  const environment: Environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});

  await database.insert(movies).values([
    {uid: 'movie-ran', year: 1985},
    {uid: 'movie-taxi', year: 1976},
    {uid: 'movie-other', year: 2000},
  ]);
  await database.insert(translations).values([
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-ran',
      languageCode: 'ja',
      content: '乱',
      isDefault: 1,
    },
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-taxi',
      languageCode: 'ja',
      content: 'タクシードライバー',
      isDefault: 1,
    },
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-other',
      languageCode: 'ja',
      content: '黒澤についての映画',
      isDefault: 1,
    },
  ]);
  await database.insert(people).values([
    {uid: 'person-kurosawa', tmdbId: 5026, name: '黒澤明'},
    {uid: 'person-scorsese', tmdbId: 1032, name: 'Martin Scorsese'},
  ]);
  await database.insert(translations).values({
    resourceType: 'person_name',
    resourceUid: 'person-scorsese',
    languageCode: 'ja',
    content: 'マーティン・スコセッシ',
  });
  await database.insert(movieCredits).values([
    {
      movieUid: 'movie-ran',
      personUid: 'person-kurosawa',
      creditId: 'c1',
      department: 'Directing',
      job: 'Director',
    },
    {
      movieUid: 'movie-taxi',
      personUid: 'person-scorsese',
      creditId: 'c2',
      department: 'Directing',
      job: 'Director',
    },
  ]);

  return environment;
}

async function search(environment: Environment, query: string) {
  const response = await moviesRoutes.request(
    `/search?q=${encodeURIComponent(query)}`,
    {},
    environment,
  );
  return (await response.json()) as SearchResponse;
}

describe('GET /movies/search 人名検索', () => {
  let environment: Environment;

  beforeEach(async () => {
    environment = await createTestEnvironment();
  });

  it('監督名で映画を引ける', async () => {
    const body = await search(environment, '黒澤明');

    expect(body.movies.map(movie => movie.uid)).toContain('movie-ran');
  });

  it('日本語表記の人名で外国人監督の映画を引ける', async () => {
    const body = await search(environment, 'スコセッシ');

    expect(body.movies.map(movie => movie.uid)).toEqual(['movie-taxi']);
  });

  it('タイトル一致と人名一致を重複なく返す', async () => {
    const body = await search(environment, '黒澤');

    expect(body.movies.map(movie => movie.uid).toSorted(byCodePoint)).toEqual([
      'movie-other',
      'movie-ran',
    ]);
  });

  it('totalCount も人名一致を数える', async () => {
    const body = await search(environment, '黒澤明');

    expect(body.pagination.totalCount).toBe(1);
  });
});
