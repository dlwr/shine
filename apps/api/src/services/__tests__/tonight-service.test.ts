import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {migrate} from '@shine/database/testing';
import {beforeEach, describe, expect, it} from 'vitest';
import {TonightService} from '../tonight-service';

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
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-tonight-'));
  const environment: Environment = {
    DATABASE_FILE_URL: `file:${path.join(directory, 'test.db')}`,
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});
  await database
    .insert(awardOrganizations)
    .values({uid: 'org-cannes', name: 'Cannes Film Festival'});
  await database.insert(awardCategories).values({
    uid: 'cat-palme',
    organizationUid: 'org-cannes',
    name: "Palme d'Or",
  });
  await database.insert(awardCeremonies).values({
    uid: 'ceremony-cannes',
    organizationUid: 'org-cannes',
    year: 2019,
  });
  return {environment, database};
}

async function seedMovie(
  database: TestDatabase,
  uid: string,
  runtime: number | undefined,
): Promise<void> {
  await database.insert(movies).values({uid, runtime});
  await database.insert(nominations).values({
    movieUid: uid,
    ceremonyUid: 'ceremony-cannes',
    categoryUid: 'cat-palme',
  });
}

describe('TonightService.listPool', () => {
  let service: TonightService;
  let database: TestDatabase;

  beforeEach(async () => {
    const created = await createTestEnvironment();
    database = created.database;
    service = new TonightService(created.environment);
  });

  it('90 分以内の賞に選ばれた映画を候補にする', async () => {
    await seedMovie(database, 'movie-90', 90);
    await seedMovie(database, 'movie-91', 91);

    const pool = await service.listPool();

    expect(pool.map(movie => movie.uid)).toEqual(['movie-90']);
  });

  it('上映時間が分からない映画は候補にしない', async () => {
    await seedMovie(database, 'movie-unknown', undefined);
    await seedMovie(database, 'movie-zero', 0);

    const pool = await service.listPool();

    expect(pool).toEqual([]);
  });
});
