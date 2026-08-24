import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {beforeEach, describe, expect, it} from 'vitest';
import {getDatabase, type Environment} from '../../index';
import {awardCategories} from '../award-categories';
import {awardCeremonies} from '../award-ceremonies';
import {awardOrganizations} from '../award-organizations';
import {movies} from '../movies';
import {nominations} from '../nominations';
import {people} from '../people';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(currentDirectory, '../../../migrations');

type TestDatabase = ReturnType<typeof getDatabase>;

async function createTestDatabase(): Promise<TestDatabase> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-noms-'));
  const environment: Environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});

  await database.insert(awardOrganizations).values({uid: 'org', name: 'Org'});
  await database
    .insert(awardCeremonies)
    .values({uid: 'ceremony', organizationUid: 'org', year: 2020});
  await database
    .insert(awardCategories)
    .values({uid: 'category', organizationUid: 'org', name: '助演男優賞'});
  await database.insert(movies).values({uid: 'movie', year: 2020});
  await database.insert(people).values([
    {uid: 'person-a', tmdbId: 1, name: 'A'},
    {uid: 'person-b', tmdbId: 2, name: 'B'},
  ]);

  return database;
}

describe('nominations の一意制約', () => {
  let database: TestDatabase;

  beforeEach(async () => {
    database = await createTestDatabase();
  });

  it('同じ映画・式・部門の作品賞は二重に入らない', async () => {
    await database.insert(nominations).values({
      movieUid: 'movie',
      ceremonyUid: 'ceremony',
      categoryUid: 'category',
    });

    await expect(
      database.insert(nominations).values({
        movieUid: 'movie',
        ceremonyUid: 'ceremony',
        categoryUid: 'category',
      }),
    ).rejects.toThrow();
  });

  it('同じ映画・式・部門でも人物が違えば入る', async () => {
    await database.insert(nominations).values({
      movieUid: 'movie',
      ceremonyUid: 'ceremony',
      categoryUid: 'category',
      personUid: 'person-a',
    });

    await database.insert(nominations).values({
      movieUid: 'movie',
      ceremonyUid: 'ceremony',
      categoryUid: 'category',
      personUid: 'person-b',
    });

    const rows = await database.select().from(nominations);
    expect(rows).toHaveLength(2);
  });

  it('同じ映画・式・部門・人物は二重に入らない', async () => {
    await database.insert(nominations).values({
      movieUid: 'movie',
      ceremonyUid: 'ceremony',
      categoryUid: 'category',
      personUid: 'person-a',
    });

    await expect(
      database.insert(nominations).values({
        movieUid: 'movie',
        ceremonyUid: 'ceremony',
        categoryUid: 'category',
        personUid: 'person-a',
      }),
    ).rejects.toThrow();
  });

  it('人物付きのノミネートは人物無しのノミネートと共存する', async () => {
    await database.insert(nominations).values({
      movieUid: 'movie',
      ceremonyUid: 'ceremony',
      categoryUid: 'category',
    });

    await database.insert(nominations).values({
      movieUid: 'movie',
      ceremonyUid: 'ceremony',
      categoryUid: 'category',
      personUid: 'person-a',
    });

    const rows = await database.select().from(nominations);
    expect(rows).toHaveLength(2);
  });
});
