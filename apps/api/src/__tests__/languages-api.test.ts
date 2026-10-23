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
import {beforeAll, describe, expect, it} from 'vitest';
import {languagesRoutes} from '../routes/languages';
import type {LanguagePage, LanguageSummary} from '../types/languages';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

async function createTestEnvironment(): Promise<Environment> {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'shine-languages-'),
  );
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
  const faMovies = Array.from({length: 101}, (_, index) => ({
    uid: `fa-${String(index).padStart(3, '0')}`,
    originalLanguage: 'fa',
    year: 1900 + index,
  }));
  await database.insert(movies).values(faMovies);
  await database.insert(nominations).values(
    faMovies.map(movie => ({
      movieUid: movie.uid,
      ceremonyUid: 'ceremony-cannes',
      categoryUid: 'cat-palme',
    })),
  );
  return environment;
}

describe('languages routes', () => {
  let environment: Environment;

  beforeAll(async () => {
    environment = await createTestEnvironment();
  });

  it('言語の一覧を返す', async () => {
    const response = await languagesRoutes.request('/', {}, environment);
    const body: LanguageSummary[] = await response.json();

    expect(body).toEqual([{code: 'fa', movieCount: 101}]);
  });

  it('1 ページ目は 100 本までにする', async () => {
    const response = await languagesRoutes.request('/fa', {}, environment);
    const body: LanguagePage = await response.json();

    expect(body.movies).toHaveLength(100);
  });

  it('2 ページ目に残りを返す', async () => {
    const response = await languagesRoutes.request(
      '/fa?page=2',
      {},
      environment,
    );
    const body: LanguagePage = await response.json();

    expect(body.movies.map(movie => movie.uid)).toEqual(['fa-000']);
  });

  it('ページの数を返す', async () => {
    const response = await languagesRoutes.request('/fa', {}, environment);
    const body: LanguagePage = await response.json();

    expect(body.pageCount).toBe(2);
  });

  it.each(['/xx', '/fa?page=3', '/fa?page=0', '/fa?page=abc'])(
    '%s は 404 を返す',
    async url => {
      const response = await languagesRoutes.request(url, {}, environment);

      expect(response.status).toBe(404);
    },
  );
});
