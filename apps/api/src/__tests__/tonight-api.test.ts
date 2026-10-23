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
import {tonightRoutes} from '../routes/tonight';
import type {TonightPick} from '../types/tonight';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

async function createTestEnvironment(): Promise<{
  environment: Environment;
  database: ReturnType<typeof getDatabase>;
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

describe('GET /tonight', () => {
  let environment: Environment;
  let database: ReturnType<typeof getDatabase>;

  beforeEach(async () => {
    ({environment, database} = await createTestEnvironment());
  });

  it('候補から 1 本返す', async () => {
    await database.insert(movies).values({uid: 'movie-short', runtime: 85});
    await database.insert(nominations).values({
      movieUid: 'movie-short',
      ceremonyUid: 'ceremony-cannes',
      categoryUid: 'cat-palme',
    });

    const response = await tonightRoutes.request('/', {}, environment);
    const body: TonightPick = await response.json();

    expect(body.movie.uid).toBe('movie-short');
  });

  it('毎回選び直すので応答をキャッシュさせない', async () => {
    await database.insert(movies).values({uid: 'movie-short', runtime: 85});
    await database.insert(nominations).values({
      movieUid: 'movie-short',
      ceremonyUid: 'ceremony-cannes',
      categoryUid: 'cat-palme',
    });

    const response = await tonightRoutes.request('/', {}, environment);

    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('候補が無ければ 404 を返す', async () => {
    const response = await tonightRoutes.request('/', {}, environment);

    expect(response.status).toBe(404);
  });
});
