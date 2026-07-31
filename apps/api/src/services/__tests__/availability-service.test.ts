import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {movieAvailabilityChecks} from '@shine/database/schema/movie-availability-checks';
import {movies} from '@shine/database/schema/movies';
import {translations} from '@shine/database/schema/translations';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {beforeEach, describe, expect, it} from 'vitest';
import {AvailabilityService} from '../availability-service';
import type {SourceRunners} from '@shine/availability';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../../packages/database/migrations',
);

type TestDatabase = ReturnType<typeof getDatabase>;

async function createTestEnvironment(): Promise<{
  environment: Environment;
  database: TestDatabase;
}> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-test-'));
  const environment: Environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});
  return {environment, database};
}

async function seedMovie(database: TestDatabase): Promise<void> {
  await database
    .insert(movies)
    .values({uid: 'movie-a', year: 2023, tmdbId: 123});
  await database.insert(translations).values([
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-a',
      languageCode: 'ja',
      content: '落下の解剖学',
    },
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-a',
      languageCode: 'en',
      content: 'Anatomy of a Fall',
      isDefault: 1,
    },
  ]);
}

describe('AvailabilityService.checkMovie', () => {
  let environment: Environment;
  let database: TestDatabase;

  beforeEach(async () => {
    ({environment, database} = await createTestEnvironment());
  });

  it('存在しない映画にはundefinedを返す', async () => {
    const service = new AvailabilityService(environment);
    const result = await service.checkMovie('no-such-movie', {});
    expect(result).toBeUndefined();
  });

  it('日本語タイトルを先頭にしてランナーへ渡す', async () => {
    await seedMovie(database);
    let receivedTitles: string[] = [];
    const runners: SourceRunners = {
      async unext(movie) {
        receivedTitles = movie.titles;
        return {source: 'unext', status: 'ok', detail: 'Matched'};
      },
    };

    const service = new AvailabilityService(environment);
    await service.checkMovie('movie-a', runners);

    expect(receivedTitles[0]).toBe('落下の解剖学');
    expect(receivedTitles).toContain('Anatomy of a Fall');
  });

  it('チェック結果を保存しokのみをavailabilityとして返す', async () => {
    await seedMovie(database);
    const runners: SourceRunners = {
      async unext() {
        return {source: 'unext', status: 'ok', detail: 'Matched: 落下の解剖学'};
      },
      async discas() {
        return {source: 'discas', status: 'ng', detail: 'No match'};
      },
    };

    const service = new AvailabilityService(environment);
    const result = await service.checkMovie('movie-a', runners);

    expect(result?.availability).toHaveLength(1);
    expect(result?.availability[0]).toMatchObject({
      source: 'unext',
      detail: 'Matched: 落下の解剖学',
    });

    const saved = await database.select().from(movieAvailabilityChecks);
    expect(saved).toHaveLength(2);
  });

  it('新鮮なキャッシュがあれば外部チェックを行わない', async () => {
    await seedMovie(database);
    await database.insert(movieAvailabilityChecks).values({
      movieUid: 'movie-a',
      source: 'unext',
      status: 'ok',
      detail: 'Matched (cached)',
      checkedAt: Math.floor(Date.now() / 1000) - 60,
    });

    let runnerCalled = false;
    const runners: SourceRunners = {
      async unext() {
        runnerCalled = true;
        return {source: 'unext', status: 'ok', detail: 'fresh'};
      },
    };

    const service = new AvailabilityService(environment);
    const result = await service.checkMovie('movie-a', runners);

    expect(runnerCalled).toBe(false);
    expect(result?.availability[0]?.detail).toBe('Matched (cached)');
  });
});
