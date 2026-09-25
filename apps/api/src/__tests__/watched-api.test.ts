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
import {watchedRoutes} from '../routes/watched';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

type WatchedListResponse = {
  lists: Array<{slug: string; grouping: string; uids: string[]}>;
};

async function createTestEnvironment(): Promise<Environment> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-watched-'));
  const environment: Environment = {
    DATABASE_FILE_URL: `file:${path.join(directory, 'test.db')}`,
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});

  await database
    .insert(awardOrganizations)
    .values({uid: 'org-cannes', name: 'Cannes Film Festival'});
  await database.insert(awardCategories).values([
    {uid: 'cat-palme', organizationUid: 'org-cannes', name: "Palme d'Or"},
    {uid: 'cat-grand-prix', organizationUid: 'org-cannes', name: 'Grand Prix'},
  ]);
  await database.insert(awardCeremonies).values([
    {uid: 'ceremony-2021', organizationUid: 'org-cannes', year: 2021},
    {uid: 'ceremony-2022', organizationUid: 'org-cannes', year: 2022},
    {uid: 'ceremony-2023', organizationUid: 'org-cannes', year: 2023},
  ]);
  await database.insert(movies).values([
    {uid: 'movie-2021', year: 2021},
    {uid: 'movie-2022-b', year: 2022},
    {uid: 'movie-2022-a', year: 2022},
    {uid: 'movie-2023', year: 2023},
    {uid: 'movie-nominee', year: 2023},
    {uid: 'movie-grand-prix', year: 2023},
  ]);
  await database.insert(nominations).values([
    {
      movieUid: 'movie-2023',
      ceremonyUid: 'ceremony-2023',
      categoryUid: 'cat-palme',
      isWinner: 1,
    },
    {
      movieUid: 'movie-nominee',
      ceremonyUid: 'ceremony-2023',
      categoryUid: 'cat-palme',
      isWinner: 0,
    },
    {
      movieUid: 'movie-2021',
      ceremonyUid: 'ceremony-2021',
      categoryUid: 'cat-palme',
      isWinner: 1,
    },
    {
      movieUid: 'movie-2022-b',
      ceremonyUid: 'ceremony-2022',
      categoryUid: 'cat-palme',
      isWinner: 1,
    },
    {
      movieUid: 'movie-2022-a',
      ceremonyUid: 'ceremony-2022',
      categoryUid: 'cat-palme',
      isWinner: 1,
    },
    {
      movieUid: 'movie-grand-prix',
      ceremonyUid: 'ceremony-2023',
      categoryUid: 'cat-grand-prix',
      isWinner: 1,
    },
  ]);

  return environment;
}

describe('GET /watched/lists', () => {
  let environment: Environment;

  beforeEach(async () => {
    environment = await createTestEnvironment();
  });

  it('最高賞の年度制リストだけを返す', async () => {
    const response = await watchedRoutes.request('/lists', {}, environment);

    expect(response.status).toBe(200);
    const body = (await response.json()) as WatchedListResponse;
    expect(body.lists.map(list => list.slug)).toEqual(['palme-dor']);
  });

  it('受賞作の uid を授賞式の年の昇順、同じ年は uid の昇順で返す', async () => {
    const response = await watchedRoutes.request('/lists', {}, environment);

    const body = (await response.json()) as WatchedListResponse;
    expect(body.lists[0].uids).toEqual([
      'movie-2021',
      'movie-2022-a',
      'movie-2022-b',
      'movie-2023',
    ]);
  });

  it('リストの要約に賞ページの要約と同じ項目を含む', async () => {
    const response = await watchedRoutes.request('/lists', {}, environment);

    const body = (await response.json()) as {
      lists: Array<Record<string, unknown>>;
    };
    expect(body.lists[0]).toMatchObject({
      slug: 'palme-dor',
      grouping: 'year',
      firstYear: 2021,
      lastYear: 2023,
      movieCount: 5,
    });
  });
});
