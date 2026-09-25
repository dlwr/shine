import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {migrate} from '@shine/database/testing';
import {afterEach, describe, expect, it} from 'vitest';
import {didCreateNomination} from '../nomination';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../../packages/database/migrations',
);

let temporaryDirectories: string[] = [];

async function createTestDatabase() {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'shine-list-nomination-'),
  );
  temporaryDirectories.push(directory);
  const database = getDatabase({
    DATABASE_FILE_URL: `file:${path.join(directory, 'test.db')}`,
  });
  await migrate(database, {migrationsFolder});

  const [organization] = await database
    .insert(awardOrganizations)
    .values({name: '1001 Movies'})
    .returning();
  const [category] = await database
    .insert(awardCategories)
    .values({organizationUid: organization.uid, name: 'Selected Films'})
    .returning();
  const [ceremony] = await database
    .insert(awardCeremonies)
    .values({organizationUid: organization.uid, year: 2026})
    .returning();
  const [movie] = await database
    .insert(movies)
    .values({originalLanguage: 'en', year: 1994})
    .returning();

  return {
    database,
    movieUid: movie.uid,
    categoryUid: category.uid,
    ceremonyUid: ceremony.uid,
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.map(async directory =>
      fs.rm(directory, {recursive: true, force: true}),
    ),
  );
  temporaryDirectories = [];
});

describe('didCreateNomination', () => {
  it('落選扱いのノミネーションを作り true を返す', async () => {
    const {database, movieUid, categoryUid, ceremonyUid} =
      await createTestDatabase();

    const created = await didCreateNomination({
      database,
      movieUid,
      categoryUid,
      ceremonyUid,
      dryRun: false,
    });

    expect(created).toBe(true);
    const [row] = await database.select().from(nominations);
    expect(row).toMatchObject({
      movieUid,
      categoryUid,
      ceremonyUid,
      isWinner: 0,
    });
  });

  it('既にあれば作らず false を返す', async () => {
    const {database, movieUid, categoryUid, ceremonyUid} =
      await createTestDatabase();
    await database
      .insert(nominations)
      .values({movieUid, categoryUid, ceremonyUid, isWinner: 0});

    const created = await didCreateNomination({
      database,
      movieUid,
      categoryUid,
      ceremonyUid,
      dryRun: false,
    });

    expect(created).toBe(false);
    expect(await database.select().from(nominations)).toHaveLength(1);
  });

  it('dry-run では書き込まず true を返す', async () => {
    const {database, movieUid, categoryUid, ceremonyUid} =
      await createTestDatabase();

    const created = await didCreateNomination({
      database,
      movieUid,
      categoryUid,
      ceremonyUid,
      dryRun: true,
    });

    expect(created).toBe(true);
    expect(await database.select().from(nominations)).toHaveLength(0);
  });

  it('skipLookup でも重複は UNIQUE 制約で増えない', async () => {
    const {database, movieUid, categoryUid, ceremonyUid} =
      await createTestDatabase();
    await database
      .insert(nominations)
      .values({movieUid, categoryUid, ceremonyUid, isWinner: 0});

    const created = await didCreateNomination({
      database,
      movieUid,
      categoryUid,
      ceremonyUid,
      dryRun: false,
      skipLookup: true,
    });

    expect(created).toBe(true);
    expect(await database.select().from(nominations)).toHaveLength(1);
  });
});
