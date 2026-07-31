import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {movieAvailabilityChecks} from '@shine/database/schema/movie-availability-checks';
import {movies} from '@shine/database/schema/movies';
import {translations} from '@shine/database/schema/translations';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {moviesRoutes} from '../routes/movies';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

async function createTestEnvironment(): Promise<{
  environment: Environment;
  database: ReturnType<typeof getDatabase>;
}> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-test-'));
  const environment: Environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});

  await database.insert(movies).values({uid: 'movie-a', year: 2023});
  await database.insert(translations).values({
    resourceType: 'movie_title',
    resourceUid: 'movie-a',
    languageCode: 'ja',
    content: '落下の解剖学',
  });

  return {environment, database};
}

describe('POST /movies/:id/availability/check', () => {
  let environment: Environment;
  let database: ReturnType<typeof getDatabase>;

  beforeEach(async () => {
    ({environment, database} = await createTestEnvironment());
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('unavailable', {status: 503})),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('存在しない映画には404を返す', async () => {
    const response = await moviesRoutes.request(
      '/no-such-movie/availability/check',
      {method: 'POST'},
      environment,
    );

    expect(response.status).toBe(404);
  });

  it('新鮮なキャッシュがあればokの結果を返す', async () => {
    await database.insert(movieAvailabilityChecks).values({
      movieUid: 'movie-a',
      source: 'unext',
      status: 'ok',
      detail: 'Matched: 落下の解剖学',
      checkedAt: Math.floor(Date.now() / 1000) - 60,
    });

    const response = await moviesRoutes.request(
      '/movie-a/availability/check',
      {method: 'POST'},
      environment,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      availability: Array<{source: string; detail?: string}>;
    };
    expect(body.availability).toHaveLength(1);
    expect(body.availability[0]?.source).toBe('unext');
  });

  it('同一IPからの過剰リクエストには429を返す', async () => {
    await database.insert(movieAvailabilityChecks).values([
      {
        movieUid: 'movie-a',
        source: 'unext',
        status: 'ok',
        detail: 'Matched',
        checkedAt: Math.floor(Date.now() / 1000) - 60,
      },
      {
        movieUid: 'movie-a',
        source: 'discas',
        status: 'ng',
        detail: 'No match',
        checkedAt: Math.floor(Date.now() / 1000) - 60,
      },
      {
        movieUid: 'movie-a',
        source: 'tmdb',
        status: 'ng',
        detail: 'No JP providers',
        checkedAt: Math.floor(Date.now() / 1000) - 60,
      },
    ]);

    let lastStatus = 0;
    for (let index = 0; index < 31; index++) {
      const response = await moviesRoutes.request(
        '/movie-a/availability/check',
        {method: 'POST', headers: {'cf-connecting-ip': '203.0.113.7'}},
        environment,
      );
      lastStatus = response.status;
    }

    expect(lastStatus).toBe(429);
  });
});
