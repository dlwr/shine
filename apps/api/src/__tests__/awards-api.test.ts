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
import {awardsRoutes} from '../routes/awards';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

async function createTestEnvironment(): Promise<Environment> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-test-'));
  const environment: Environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
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
    uid: 'ceremony-2023',
    organizationUid: 'org-cannes',
    year: 2023,
  });
  await database.insert(movies).values({uid: 'movie-a', year: 2023});
  await database.insert(translations).values({
    resourceType: 'movie_title',
    resourceUid: 'movie-a',
    languageCode: 'en',
    content: 'Anatomy of a Fall',
    isDefault: 1,
  });
  await database.insert(nominations).values({
    movieUid: 'movie-a',
    ceremonyUid: 'ceremony-2023',
    categoryUid: 'cat-palme',
    isWinner: 1,
  });

  return environment;
}

describe('GET /awards', () => {
  let environment: Environment;

  beforeEach(async () => {
    environment = await createTestEnvironment();
  });

  it('returns award summaries', async () => {
    const response = await awardsRoutes.request('/', {}, environment);

    expect(response.status).toBe(200);
    const body = (await response.json()) as {awards: Array<{slug: string}>};
    expect(body.awards.map(award => award.slug)).toEqual(['palme-dor']);
  });
});

describe('GET /awards/:slug', () => {
  let environment: Environment;

  beforeEach(async () => {
    environment = await createTestEnvironment();
  });

  it('returns the award detail', async () => {
    const response = await awardsRoutes.request('/palme-dor', {}, environment);

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      slug: string;
      years: Array<{year: number}>;
    };
    expect(body.slug).toBe('palme-dor');
    expect(body.years[0]?.year).toBe(2023);
  });

  it('returns 404 for an unknown slug', async () => {
    const response = await awardsRoutes.request(
      '/no-such-award',
      {},
      environment,
    );

    expect(response.status).toBe(404);
  });
});

describe('X-Cache-Status header', () => {
  function createStubKv(): KVNamespace {
    const store = new Map<string, string>();
    return {
      async get(key: string) {
        return store.get(key) ?? null;
      },
      async put(key: string, value: string) {
        store.set(key, value);
      },
      async delete(key: string) {
        store.delete(key);
      },
    } as unknown as KVNamespace;
  }

  it('returns MISS on first request and HIT on second', async () => {
    const environment = await createTestEnvironment();
    environment.CACHE_KV = createStubKv();

    const first = await awardsRoutes.request('/', {}, environment);
    expect(first.headers.get('X-Cache-Status')).toBe('MISS');

    const second = await awardsRoutes.request('/', {}, environment);
    expect(second.headers.get('X-Cache-Status')).toBe('HIT');
  });
});
