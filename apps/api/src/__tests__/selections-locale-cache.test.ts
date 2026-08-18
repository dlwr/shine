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
import {SelectionsService} from '../services/selections-service';
import {EdgeCache} from '../utils/cache';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

function createStatefulCacheStub() {
  const store = new Map<string, Response>();
  return {
    async match(key: string) {
      return store.get(key)?.clone();
    },
    async put(key: string, response: Response) {
      store.set(key, response);
    },
    async delete(key: string) {
      return store.delete(key);
    },
    async keys() {
      return store
        .keys()
        .map(key => new Request(key))
        .toArray();
    },
  } as unknown as Cache;
}

describe('selections cache and locale', () => {
  let environment: Environment;
  let service: SelectionsService;

  beforeEach(async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-test-'));
    environment = {
      TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
      TURSO_AUTH_TOKEN: '',
    } as Environment;
    const database = getDatabase(environment);
    await migrate(database, {migrationsFolder});

    await database
      .insert(awardOrganizations)
      .values({uid: 'org-1', name: 'Test Award'});
    await database
      .insert(awardCeremonies)
      .values({uid: 'ceremony-1', organizationUid: 'org-1', year: 2020});
    await database.insert(awardCategories).values({
      uid: 'category-1',
      organizationUid: 'org-1',
      name: 'Best Picture',
    });
    await database.insert(movies).values({uid: 'movie-a', year: 2020});
    await database.insert(translations).values([
      {
        resourceType: 'movie_title',
        resourceUid: 'movie-a',
        languageCode: 'en',
        content: 'Movie A',
        isDefault: 1,
      },
      {
        resourceType: 'movie_title',
        resourceUid: 'movie-a',
        languageCode: 'ja',
        content: '映画A',
        isDefault: 0,
      },
    ]);
    await database.insert(nominations).values({
      movieUid: 'movie-a',
      ceremonyUid: 'ceremony-1',
      categoryUid: 'category-1',
    });

    service = new SelectionsService(
      environment,
      new EdgeCache(createStatefulCacheStub()),
    );
  });

  it('does not leak cached selections across locales', async () => {
    const date = new Date('2024-06-24');

    const english = await service.getDateSeededSelections({
      locale: 'en',
      date,
    });
    const japanese = await service.getDateSeededSelections({
      locale: 'ja',
      date,
    });

    expect(english.daily.title).toBe('Movie A');
    expect(japanese.daily.title).toBe('映画A');
  });

  it('serves repeated same-locale requests from cache', async () => {
    const date = new Date('2024-06-24');

    const first = await service.getDateSeededSelections({locale: 'ja', date});
    const second = await service.getDateSeededSelections({locale: 'ja', date});

    expect(second.daily.title).toBe(first.daily.title);
    expect(second.daily.uid).toBe('movie-a');
  });
});
