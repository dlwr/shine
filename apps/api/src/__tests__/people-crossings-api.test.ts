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
import {people} from '@shine/database/schema/people';
import {translations} from '@shine/database/schema/translations';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {beforeEach, describe, expect, it} from 'vitest';
import app from '../index';
import type {PersonCrossings} from '@shine/types';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

let environment: Environment;

beforeEach(async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'shine-people-crossings-'),
  );
  environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});

  await database.insert(awardOrganizations).values([
    {uid: 'org-academy', name: 'Academy Awards'},
    {uid: 'org-bafta', name: 'British Academy Film Awards'},
  ]);
  await database.insert(awardCategories).values([
    {
      uid: 'cat-academy-actress',
      organizationUid: 'org-academy',
      name: 'Academy Award for Best Actress',
    },
    {
      uid: 'cat-bafta-actress',
      organizationUid: 'org-bafta',
      name: 'BAFTA Award for Best Actress in a Leading Role',
    },
  ]);
  await database.insert(awardCeremonies).values([
    {uid: 'ceremony-academy', organizationUid: 'org-academy', year: 2008},
    {uid: 'ceremony-bafta', organizationUid: 'org-bafta', year: 2008},
  ]);
  await database.insert(movies).values({uid: 'movie-1', year: 2007});
  await database.insert(translations).values([
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-1',
      languageCode: 'ja',
      content: 'エディット・ピアフ〜愛の讃歌〜',
    },
    {
      resourceType: 'person_name',
      resourceUid: 'person-1',
      languageCode: 'ja',
      content: 'マリオン・コティヤール',
    },
  ]);
  await database
    .insert(people)
    .values({uid: 'person-1', tmdbId: 1, name: 'Marion Cotillard'});
  await database.insert(nominations).values([
    {
      movieUid: 'movie-1',
      ceremonyUid: 'ceremony-academy',
      categoryUid: 'cat-academy-actress',
      personUid: 'person-1',
      isWinner: 1,
    },
    {
      movieUid: 'movie-1',
      ceremonyUid: 'ceremony-bafta',
      categoryUid: 'cat-bafta-actress',
      personUid: 'person-1',
      isWinner: 1,
    },
  ]);
});

async function fetchPersonCrossings(query = '') {
  const response = await app.request(
    `/people/crossings${query}`,
    {},
    environment,
  );
  const body = (await response.json()) as PersonCrossings;

  return {response, body};
}

describe('GET /people/crossings', () => {
  it('団体ごとの受賞した演技の数を返す', async () => {
    const {body} = await fetchPersonCrossings();

    expect(body.organizations).toContainEqual(
      expect.objectContaining({key: 'academy', performanceCount: 1}),
    );
  });

  it('団体の組み合わせごとの共通する演技の数を返す', async () => {
    const {body} = await fetchPersonCrossings();

    expect(body.pairs).toContainEqual({a: 'academy', b: 'bafta', shared: 1});
  });

  it('複数の団体に選ばれた演技を日本語名で返す', async () => {
    const {body} = await fetchPersonCrossings();

    expect(body.topPerformances[0]).toMatchObject({
      person: {uid: 'person-1', name: 'マリオン・コティヤール'},
      movie: {uid: 'movie-1', title: 'エディット・ピアフ〜愛の讃歌〜'},
      organizationCount: 2,
    });
  });

  it('locale=en なら原語名で返す', async () => {
    const {body} = await fetchPersonCrossings('?locale=en');

    expect(body.topPerformances[0].person.name).toBe('Marion Cotillard');
  });

  it('キャッシュヘッダーを付けて返す', async () => {
    const {response} = await fetchPersonCrossings();

    expect(response.headers.get('Cache-Control')).toContain('max-age=');
  });
});
