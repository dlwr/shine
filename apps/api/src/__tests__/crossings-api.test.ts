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
import type {AwardCrossings} from '@shine/types';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

let environment: Environment;

beforeEach(async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'shine-crossings-'),
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
  await database.insert(movies).values({uid: 'movie-1', year: 2019});
  await database.insert(translations).values({
    resourceType: 'movie_title',
    resourceUid: 'movie-1',
    languageCode: 'ja',
    content: '二冠の映画',
  });
  await database.insert(nominations).values([
    {
      movieUid: 'movie-1',
      ceremonyUid: 'ceremony-cannes',
      categoryUid: 'cat-palme',
    },
    {
      movieUid: 'movie-1',
      ceremonyUid: 'ceremony-academy',
      categoryUid: 'cat-best-picture',
    },
  ]);
});

async function fetchCrossings() {
  const response = await app.request('/crossings', {}, environment);
  const body = (await response.json()) as AwardCrossings;

  return {response, body};
}

describe('GET /crossings', () => {
  it('賞ごとの作品数を返す', async () => {
    const {body} = await fetchCrossings();

    expect(body.awards).toContainEqual(
      expect.objectContaining({slug: 'palme-dor', filmCount: 1}),
    );
  });

  it('賞の組み合わせごとの共通本数を返す', async () => {
    const {body} = await fetchCrossings();

    expect(body.pairs).toContainEqual({
      a: 'academy-best-picture',
      b: 'palme-dor',
      shared: 1,
    });
  });

  it('複数の賞に選ばれた映画を返す', async () => {
    const {body} = await fetchCrossings();

    expect(body.topMovies[0]).toMatchObject({
      uid: 'movie-1',
      title: '二冠の映画',
    });
  });

  it('キャッシュヘッダーを付けて返す', async () => {
    const {response} = await fetchCrossings();

    expect(response.headers.get('Cache-Control')).toContain('max-age=');
  });
});
