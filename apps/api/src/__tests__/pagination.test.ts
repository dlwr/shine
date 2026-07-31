import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {translations} from '@shine/database/schema/translations';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {beforeEach, describe, expect, it} from 'vitest';
import {createJWT} from '../auth';
import {adminRoutes} from '../routes/admin';
import {moviesRoutes} from '../routes/movies';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

const JWT_SECRET = 'test-secret';

describe('pagination guards', () => {
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

    await database.insert(movies).values({uid: 'movie-a', year: 2020});
    await database.insert(translations).values({
      resourceType: 'movie_title',
      resourceUid: 'movie-a',
      languageCode: 'en',
      content: 'Movie A',
      isDefault: 1,
    });
  });

  async function search(query: string) {
    return moviesRoutes.request(`/search${query}`, {}, environment);
  }

  async function getAdminMovies(query: string) {
    const token = await createJWT(JWT_SECRET);
    return adminRoutes.request(
      `/movies${query}`,
      {headers: {Authorization: `Bearer ${token}`}},
      environment,
    );
  }

  describe('GET /search (movies)', () => {
    it('falls back to page 1 when page is not a number', async () => {
      const response = await search('?page=abc');

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        pagination: {currentPage: number};
      };
      expect(body.pagination.currentPage).toBe(1);
    });

    it('falls back to page 1 when page is negative', async () => {
      const response = await search('?page=-3');

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        pagination: {currentPage: number};
      };
      expect(body.pagination.currentPage).toBe(1);
    });

    it('falls back to the default limit when limit is negative', async () => {
      const response = await search('?limit=-5');

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        pagination: {totalPages: number};
        movies: unknown[];
      };
      expect(body.pagination.totalPages).toBe(1);
      expect(body.movies).toHaveLength(1);
    });

    it('falls back to the default limit when limit is not a number', async () => {
      const response = await search('?limit=abc');

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        pagination: {totalPages: number};
      };
      expect(body.pagination.totalPages).toBe(1);
    });
  });

  describe('GET /movies (admin)', () => {
    it('falls back to page 1 when page is not a number', async () => {
      const response = await getAdminMovies('?page=abc');

      expect(response.status).toBe(200);
      const body = (await response.json()) as {pagination: {page: number}};
      expect(body.pagination.page).toBe(1);
    });

    it('falls back to the default limit when limit is negative', async () => {
      const response = await getAdminMovies('?limit=-5');

      expect(response.status).toBe(200);
      const body = (await response.json()) as {pagination: {limit: number}};
      expect(body.pagination.limit).toBe(50);
    });

    it('caps limit at 100', async () => {
      const response = await getAdminMovies('?limit=500');

      expect(response.status).toBe(200);
      const body = (await response.json()) as {pagination: {limit: number}};
      expect(body.pagination.limit).toBe(100);
    });
  });
});
