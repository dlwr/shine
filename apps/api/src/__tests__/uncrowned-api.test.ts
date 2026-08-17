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
import {translations} from '@shine/database/schema/translations';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {beforeEach, describe, expect, it} from 'vitest';
import app from '../index';
import type {Uncrowned} from '@shine/types';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

let environment: Environment;

beforeEach(async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'shine-uncrowned-'),
  );
  environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});

  await database.insert(awardOrganizations).values([
    {uid: 'org-cannes', name: 'Cannes Film Festival'},
    {uid: 'org-academy', name: 'Academy Awards'},
  ]);
  await database.insert(awardCategories).values([
    {uid: 'cat-palme', organizationUid: 'org-cannes', name: "Palme d'Or"},
    {
      uid: 'cat-best-picture',
      organizationUid: 'org-academy',
      name: 'Academy Award for Best Picture',
    },
  ]);
  await database.insert(awardCeremonies).values([
    {uid: 'ceremony-cannes', organizationUid: 'org-cannes', year: 2020},
    {uid: 'ceremony-academy', organizationUid: 'org-academy', year: 2020},
  ]);
  await database.insert(movies).values([
    {uid: 'movie-loser', year: 2019},
    {uid: 'movie-winner', year: 2019},
  ]);
  await database.insert(translations).values({
    resourceType: 'movie_title',
    resourceUid: 'movie-loser',
    languageCode: 'ja',
    content: '無冠の映画',
  });
  await database.insert(nominations).values([
    {
      movieUid: 'movie-loser',
      ceremonyUid: 'ceremony-cannes',
      categoryUid: 'cat-palme',
    },
    {
      movieUid: 'movie-loser',
      ceremonyUid: 'ceremony-academy',
      categoryUid: 'cat-best-picture',
    },
    {
      movieUid: 'movie-winner',
      ceremonyUid: 'ceremony-cannes',
      categoryUid: 'cat-palme',
      isWinner: 1,
    },
  ]);
});

async function fetchUncrowned() {
  const response = await app.request('/uncrowned', {}, environment);
  const body = (await response.json()) as Uncrowned;

  return {response, body};
}

describe('GET /uncrowned', () => {
  it('無冠の映画を返す', async () => {
    const {body} = await fetchUncrowned();

    expect(body.topMovies).toHaveLength(1);
    expect(body.topMovies[0]).toMatchObject({
      uid: 'movie-loser',
      title: '無冠の映画',
    });
  });

  it('母数を返す', async () => {
    const {body} = await fetchUncrowned();

    expect(body.nominatedFilmCount).toBe(2);
    expect(body.uncrownedFilmCount).toBe(1);
  });

  it('キャッシュヘッダーを付けて返す', async () => {
    const {response} = await fetchUncrowned();

    expect(response.headers.get('Cache-Control')).toContain('max-age=');
  });
});
