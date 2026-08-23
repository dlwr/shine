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
import {peopleRoutes} from '../routes/people';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

type PersonResponse = {
  name: string;
  credits: Array<{title: string; job?: string}>;
};

async function createTestEnvironment(): Promise<Environment> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-test-'));
  const environment: Environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});

  await database.insert(movies).values({uid: 'movie-ran', year: 1985});
  await database.insert(translations).values({
    resourceType: 'movie_title',
    resourceUid: 'movie-ran',
    languageCode: 'ja',
    content: '乱',
    isDefault: 1,
  });
  await database
    .insert(people)
    .values({uid: 'person-kurosawa', tmdbId: 5026, name: '黒澤明'});
  await database.insert(movieCredits).values({
    movieUid: 'movie-ran',
    personUid: 'person-kurosawa',
    creditId: 'c1',
    department: 'Directing',
    job: 'Director',
  });

  return environment;
}

describe('GET /people/:id', () => {
  let environment: Environment;

  beforeEach(async () => {
    environment = await createTestEnvironment();
  });

  it('人物と参加作品を返す', async () => {
    const response = await peopleRoutes.request(
      '/person-kurosawa',
      {},
      environment,
    );

    const body = (await response.json()) as PersonResponse;
    expect(body.name).toBe('黒澤明');
    expect(body.credits.map(credit => credit.title)).toEqual(['乱']);
  });

  it('存在しない人物には404を返す', async () => {
    const response = await peopleRoutes.request('/missing', {}, environment);

    expect(response.status).toBe(404);
  });
});

describe('GET /people', () => {
  let environment: Environment;

  beforeEach(async () => {
    environment = await createTestEnvironment();
  });

  it('人物の一覧と件数を返す', async () => {
    const response = await peopleRoutes.request('/?limit=10', {}, environment);

    const body = (await response.json()) as {
      people: Array<{uid: string; name: string; movieCount: number}>;
      pagination: {totalCount: number};
    };
    expect(response.status).toBe(200);
    expect(body.people).toEqual([
      {uid: 'person-kurosawa', name: '黒澤明', movieCount: 1},
    ]);
    expect(body.pagination.totalCount).toBe(1);
  });

  it('ページ番号が不正なら400を返す', async () => {
    const response = await peopleRoutes.request('/?page=0', {}, environment);

    expect(response.status).toBe(400);
  });
});
