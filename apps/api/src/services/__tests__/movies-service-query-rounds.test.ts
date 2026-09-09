import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {articleLinks} from '@shine/database/schema/article-links';
import {movieCredits} from '@shine/database/schema/movie-credits';
import {movies} from '@shine/database/schema/movies';
import {people} from '@shine/database/schema/people';
import {translations} from '@shine/database/schema/translations';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {MoviesService} from '../movies-service';

type Database = ReturnType<typeof getDatabase>;
type Client = Database['$client'];

const {tracker} = vi.hoisted(() => ({
  tracker: {inFlight: 0, rounds: 0},
}));

vi.mock('@shine/database', async importOriginal => {
  const original = await importOriginal<typeof import('@shine/database')>();
  return {
    ...original,
    getDatabase(environment: Environment) {
      const database = original.getDatabase(environment);
      const client = database.$client;
      const execute = client.execute.bind(client);
      client.execute = (async (
        ...arguments_: Parameters<Client['execute']>
      ) => {
        if (tracker.inFlight === 0) {
          tracker.rounds++;
        }

        tracker.inFlight++;
        try {
          return await execute(...arguments_);
        } finally {
          tracker.inFlight--;
        }
      }) as Client['execute'];
      return database;
    },
  };
});

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../../packages/database/migrations',
);

async function createTestEnvironment(): Promise<Environment> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-test-'));
  const environment: Environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});

  await database.insert(movies).values({uid: 'movie-a', year: 1976});
  await database.insert(translations).values({
    resourceType: 'movie_title',
    resourceUid: 'movie-a',
    languageCode: 'ja',
    content: 'タクシードライバー',
    isDefault: 1,
  });
  await database
    .insert(people)
    .values({uid: 'person-scorsese', tmdbId: 1032, name: 'Martin Scorsese'});
  await database.insert(movieCredits).values({
    movieUid: 'movie-a',
    personUid: 'person-scorsese',
    creditId: 'c1',
    department: 'Directing',
    job: 'Director',
  });
  await database.insert(articleLinks).values({
    movieUid: 'movie-a',
    url: 'https://example.com/a',
    title: 'ある記事',
    submittedAt: new Date(1_700_000_000_000),
  });

  return environment;
}

describe('MoviesService.getMovieDetails の DB 往復', () => {
  let environment: Environment;

  beforeEach(async () => {
    environment = await createTestEnvironment();
    tracker.inFlight = 0;
    tracker.rounds = 0;
  });

  it('独立した問い合わせを並列に投げて 1 往復で済ませる', async () => {
    const details = await new MoviesService(environment).getMovieDetails(
      'movie-a',
      'ja',
    );

    expect(details.title).toBe('タクシードライバー');
    expect(tracker.rounds).toBe(1);
  });

  it('存在しない映画には Movie not found を投げる', async () => {
    await expect(
      new MoviesService(environment).getMovieDetails('no-such-movie', 'ja'),
    ).rejects.toThrow('Movie not found');
  });
});
