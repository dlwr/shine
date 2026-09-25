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
import {posterUrls} from '@shine/database/schema/poster-urls';
import {translations} from '@shine/database/schema/translations';
import {migrate} from '@shine/database/testing';
import {beforeEach, describe, expect, it} from 'vitest';
import {createJWT} from '../auth';
import {selectionsAdminRoutes} from '../routes/selections-admin';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

const JWT_SECRET = 'test-secret';

type PreviewResponse = {
  uid: string;
  title?: string;
  posterUrls?: Array<{url: string; isPrimary: number}>;
};

let environment: Environment;

beforeEach(async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-test-'));
  environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
    JWT_SECRET,
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});

  await database
    .insert(awardOrganizations)
    .values({uid: 'org-1', name: 'Test Award'});
  await database
    .insert(awardCeremonies)
    .values({uid: 'ceremony-1', organizationUid: 'org-1', year: 2020});
  await database.insert(awardCategories).values([
    {uid: 'category-picture', organizationUid: 'org-1', name: 'Best Picture'},
    {uid: 'category-actor', organizationUid: 'org-1', name: 'Best Actor'},
  ]);
  await database.insert(movies).values([
    {uid: 'movie-work', year: 2020},
    {uid: 'movie-person', year: 2021},
  ]);
  await database.insert(translations).values([
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-work',
      languageCode: 'ja',
      content: '作品賞の映画',
      isDefault: 1,
    },
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-person',
      languageCode: 'ja',
      content: '個人賞だけの映画',
      isDefault: 1,
    },
  ]);
  await database.insert(nominations).values({
    movieUid: 'movie-work',
    ceremonyUid: 'ceremony-1',
    categoryUid: 'category-picture',
  });
  await database.insert(people).values(
    Array.from({length: 9}, (_, index) => ({
      uid: `person-${index}`,
      tmdbId: index + 1,
      name: `俳優${index}`,
    })),
  );
  await database.insert(nominations).values(
    Array.from({length: 9}, (_, index) => ({
      movieUid: 'movie-person',
      ceremonyUid: 'ceremony-1',
      categoryUid: 'category-actor',
      personUid: `person-${index}`,
    })),
  );
  await database.insert(posterUrls).values([
    {movieUid: 'movie-work', url: 'https://image.test/other.jpg', isPrimary: 0},
    {
      movieUid: 'movie-work',
      url: 'https://image.test/primary.jpg',
      isPrimary: 1,
    },
  ]);
});

async function requestPreview(): Promise<PreviewResponse> {
  const token = await createJWT(JWT_SECRET);
  const response = await selectionsAdminRoutes.request(
    '/admin/random-movie-preview',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({locale: 'ja'}),
    },
    environment,
  );
  return (await response.json()) as PreviewResponse;
}

describe('POST /admin/random-movie-preview', () => {
  it('個人賞のノミネートしか無い映画は候補にしない', async () => {
    const uids = new Set<string>();
    for (let index = 0; index < 5; index++) {
      const preview = await requestPreview();
      uids.add(preview.uid);
    }

    expect([...uids]).toEqual(['movie-work']);
  });

  it('ポスターは代表のものを先頭に返す', async () => {
    const preview = await requestPreview();

    expect(preview.posterUrls?.[0]?.url).toBe('https://image.test/primary.jpg');
  });
});
