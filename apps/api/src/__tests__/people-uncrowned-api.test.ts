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
import type {PersonUncrowned} from '@shine/types';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

let environment: Environment;

beforeEach(async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'shine-people-uncrowned-'),
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
      uid: 'cat-academy-director',
      organizationUid: 'org-academy',
      name: 'Academy Award for Best Director',
    },
    {
      uid: 'cat-bafta-director',
      organizationUid: 'org-bafta',
      name: 'BAFTA Award for Best Direction',
    },
  ]);
  await database.insert(awardCeremonies).values([
    {uid: 'ceremony-academy', organizationUid: 'org-academy', year: 1995},
    {uid: 'ceremony-bafta', organizationUid: 'org-bafta', year: 1995},
  ]);
  await database.insert(movies).values({uid: 'movie-1', year: 1994});
  await database
    .insert(people)
    .values([{uid: 'person-1', tmdbId: 1, name: 'Never Won'}]);
  await database.insert(translations).values({
    resourceType: 'person_name',
    resourceUid: 'person-1',
    languageCode: 'ja',
    content: '無冠の監督',
  });
  await database.insert(nominations).values([
    {
      movieUid: 'movie-1',
      ceremonyUid: 'ceremony-academy',
      categoryUid: 'cat-academy-director',
      personUid: 'person-1',
      isWinner: 0,
    },
    {
      movieUid: 'movie-1',
      ceremonyUid: 'ceremony-bafta',
      categoryUid: 'cat-bafta-director',
      personUid: 'person-1',
      isWinner: 0,
    },
  ]);
});

async function fetchPersonUncrowned(query = '') {
  const response = await app.request(
    `/people/uncrowned${query}`,
    {},
    environment,
  );
  const body = (await response.json()) as PersonUncrowned;

  return {response, body};
}

describe('GET /people/uncrowned', () => {
  it('無冠の映画人を敗北付きで返す', async () => {
    const {response, body} = await fetchPersonUncrowned();

    expect(response.status).toBe(200);
    expect(body.nominatedPersonCount).toBe(1);
    expect(body.uncrownedPersonCount).toBe(1);
    expect(body.topPeople[0]).toMatchObject({
      uid: 'person-1',
      name: '無冠の監督',
      losses: [
        {slug: 'academy-director', year: 1995},
        {slug: 'bafta-director', year: 1995},
      ],
    });
  });

  it('locale=en なら原語名で返す', async () => {
    const {body} = await fetchPersonUncrowned('?locale=en');

    expect(body.topPeople[0].name).toBe('Never Won');
  });

  it('キャッシュヘッダーを付けて返す', async () => {
    const {response} = await fetchPersonUncrowned();

    expect(response.headers.get('Cache-Control')).toContain('max-age=');
  });
});
