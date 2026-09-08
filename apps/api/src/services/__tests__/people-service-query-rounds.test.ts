import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {movieCredits} from '@shine/database/schema/movie-credits';
import {movies} from '@shine/database/schema/movies';
import {people} from '@shine/database/schema/people';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {PeopleService} from '../people-service';

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
  await database.insert(movies).values({uid: 'movie-ran', year: 1985});
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

describe('PeopleService.getPerson の DB 往復', () => {
  let environment: Environment;

  beforeEach(async () => {
    environment = await createTestEnvironment();
    tracker.inFlight = 0;
    tracker.rounds = 0;
  });

  it('独立した問い合わせを並列に投げて 2 往復で済ませる', async () => {
    const person = await new PeopleService(environment).getPerson(
      'person-kurosawa',
      'ja',
    );

    expect(person?.name).toBe('黒澤明');
    expect(tracker.rounds).toBe(2);
  });
});
