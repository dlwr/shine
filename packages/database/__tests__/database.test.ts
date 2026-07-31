import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createClient, type Client} from '@libsql/client';
import {eq, sql} from 'drizzle-orm';
import {drizzle, type LibSQLDatabase} from 'drizzle-orm/libsql';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {
  awardCategories,
  awardOrganizations,
  movies,
  translations,
} from '../src/schema/index';

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../migrations',
);

const isUniqueViolation = (error: unknown): boolean => {
  let current: unknown = error;
  while (current instanceof Error) {
    if (current.message.includes('UNIQUE')) {
      return true;
    }

    current = current.cause;
  }

  return false;
};

describe('Database Schema', () => {
  let temporaryDirectory: string;
  let client: Client;
  let database: LibSQLDatabase;

  beforeAll(async () => {
    temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'shine-db-test-'));
    client = createClient({
      url: `file:${path.join(temporaryDirectory, 'test.db')}`,
    });
    database = drizzle({client, casing: 'snake_case'});
    await migrate(database, {migrationsFolder});
  });

  afterAll(() => {
    client.close();
    rmSync(temporaryDirectory, {recursive: true, force: true});
  });

  describe('migrations', () => {
    it('creates all schema tables', async () => {
      const result = await client.execute(
        `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`,
      );
      const tableNames = result.rows.map(row => row.name as string);

      const expectedTables = [
        'article_links',
        'award_categories',
        'award_ceremonies',
        'award_organizations',
        'movie_availability_checks',
        'movie_selections',
        'movies',
        'nominations',
        'poster_urls',
        'reference_urls',
        'translations',
      ];

      for (const table of expectedTables) {
        expect(tableNames).toContain(table);
      }
    });
  });

  describe('movies unique constraints', () => {
    it('rejects duplicate imdbId', async () => {
      await database.insert(movies).values({imdbId: 'tt0000001'});

      await expect(
        database.insert(movies).values({imdbId: 'tt0000001'}),
      ).rejects.toSatisfy(isUniqueViolation);
    });

    it('rejects duplicate tmdbId', async () => {
      await database.insert(movies).values({tmdbId: 12_345});

      await expect(
        database.insert(movies).values({tmdbId: 12_345}),
      ).rejects.toSatisfy(isUniqueViolation);
    });
  });

  describe('translations composite unique constraint', () => {
    it('rejects duplicate (resourceType, resourceUid, languageCode)', async () => {
      await database.insert(translations).values({
        resourceType: 'movie_title',
        resourceUid: 'movie-1',
        languageCode: 'ja',
        content: 'タイトル',
      });

      await expect(
        database.insert(translations).values({
          resourceType: 'movie_title',
          resourceUid: 'movie-1',
          languageCode: 'ja',
          content: '別タイトル',
        }),
      ).rejects.toSatisfy(isUniqueViolation);
    });

    it('allows same resource in another language', async () => {
      await database.insert(translations).values({
        resourceType: 'movie_title',
        resourceUid: 'movie-1',
        languageCode: 'en',
        content: 'Title',
      });

      const rows = await database
        .select()
        .from(translations)
        .where(eq(translations.resourceUid, 'movie-1'));
      expect(rows).toHaveLength(2);
    });
  });

  describe('updatedAt $onUpdate', () => {
    it('auto-updates updatedAt on update()', async () => {
      const [inserted] = await database
        .insert(movies)
        .values({imdbId: 'tt0000002'})
        .returning();

      await client.execute({
        sql: `UPDATE movies SET updated_at = 100 WHERE uid = ?`,
        args: [inserted.uid],
      });

      await database
        .update(movies)
        .set({year: 2000})
        .where(eq(movies.uid, inserted.uid));

      const [updated] = await database
        .select()
        .from(movies)
        .where(eq(movies.uid, inserted.uid));
      expect(updated.updatedAt).toBeGreaterThan(100);
    });

    it('auto-updates updatedAt on onConflictDoUpdate()', async () => {
      const [inserted] = await database
        .insert(translations)
        .values({
          resourceType: 'movie_title',
          resourceUid: 'movie-2',
          languageCode: 'ja',
          content: '旧タイトル',
        })
        .returning();

      await client.execute({
        sql: `UPDATE translations SET updated_at = 100 WHERE uid = ?`,
        args: [inserted.uid],
      });

      await database
        .insert(translations)
        .values({
          resourceType: 'movie_title',
          resourceUid: 'movie-2',
          languageCode: 'ja',
          content: '新タイトル',
        })
        .onConflictDoUpdate({
          target: [
            translations.resourceType,
            translations.resourceUid,
            translations.languageCode,
          ],
          set: {content: '新タイトル'},
        });

      const [updated] = await database
        .select()
        .from(translations)
        .where(eq(translations.uid, inserted.uid));
      expect(updated.content).toBe('新タイトル');
      expect(updated.updatedAt).toBeGreaterThan(100);
    });

    it('does not change updatedAt without an update', async () => {
      const [inserted] = await database
        .insert(movies)
        .values({imdbId: 'tt0000003'})
        .returning();

      await client.execute({
        sql: `UPDATE movies SET updated_at = 100 WHERE uid = ?`,
        args: [inserted.uid],
      });

      const [selected] = await database
        .select()
        .from(movies)
        .where(eq(movies.uid, inserted.uid));
      expect(selected.updatedAt).toBe(100);
    });
  });

  describe('award_categories scoped unique constraint', () => {
    it('allows the same category name in different organizations', async () => {
      const [organizationA] = await database
        .insert(awardOrganizations)
        .values({name: 'Org A', shortName: 'A'})
        .returning();
      const [organizationB] = await database
        .insert(awardOrganizations)
        .values({name: 'Org B', shortName: 'B'})
        .returning();

      await database.insert(awardCategories).values({
        organizationUid: organizationA.uid,
        name: 'Best Picture',
      });
      await database.insert(awardCategories).values({
        organizationUid: organizationB.uid,
        name: 'Best Picture',
      });

      const rows = await database
        .select()
        .from(awardCategories)
        .where(eq(awardCategories.name, 'Best Picture'));
      expect(rows).toHaveLength(2);
    });

    it('rejects the same category name within one organization', async () => {
      const [organization] = await database
        .select()
        .from(awardOrganizations)
        .where(eq(awardOrganizations.name, 'Org A'));

      await expect(
        database.insert(awardCategories).values({
          organizationUid: organization.uid,
          name: 'Best Picture',
        }),
      ).rejects.toSatisfy(isUniqueViolation);
    });
  });

  describe('defaults', () => {
    it('fills createdAt and updatedAt on insert', async () => {
      const before = Math.floor(Date.now() / 1000);
      const [inserted] = await database
        .insert(movies)
        .values({imdbId: 'tt0000004'})
        .returning();

      expect(inserted.createdAt).toBeGreaterThanOrEqual(before);
      expect(inserted.updatedAt).toBeGreaterThanOrEqual(before);
      await expect(
        database
          .select({value: sql<number>`1`})
          .from(movies)
          .where(eq(movies.uid, inserted.uid)),
      ).resolves.toHaveLength(1);
    });
  });
});
