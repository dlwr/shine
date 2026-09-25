import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {migrate} from '@shine/database/testing';
import {afterEach, describe, expect, it} from 'vitest';
import {loadExistingMovies} from '../existing-movies';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../../packages/database/migrations',
);

let temporaryDirectories: string[] = [];

async function createTestDatabase() {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'shine-existing-movies-'),
  );
  temporaryDirectories.push(directory);
  const database = getDatabase({
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
  });
  await migrate(database, {migrationsFolder});
  return database;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.map(async directory =>
      fs.rm(directory, {recursive: true, force: true}),
    ),
  );
  temporaryDirectories = [];
});

describe('loadExistingMovies', () => {
  it('IMDb ID で既存映画を引き、TMDb ID があれば載せる', async () => {
    const database = await createTestDatabase();
    const [withTmdb] = await database
      .insert(movies)
      .values({originalLanguage: 'en', imdbId: 'tt0000001', tmdbId: 10})
      .returning();
    const [withoutTmdb] = await database
      .insert(movies)
      .values({originalLanguage: 'en', imdbId: 'tt0000002'})
      .returning();

    const {existingByImdbId} = await loadExistingMovies(database, [
      'tt0000001',
      'tt0000002',
      'tt0000003',
    ]);

    expect(existingByImdbId.entries().toArray()).toEqual([
      ['tt0000001', {uid: withTmdb.uid, imdbId: 'tt0000001', tmdbId: 10}],
      ['tt0000002', {uid: withoutTmdb.uid, imdbId: 'tt0000002'}],
    ]);
  });

  it('soft-deleted の映画は既存扱いにせず別に返す', async () => {
    const database = await createTestDatabase();
    await database.insert(movies).values({
      originalLanguage: 'en',
      imdbId: 'tt0000001',
      deletedAt: Date.now(),
    });

    const {existingByImdbId, softDeletedImdbIds} = await loadExistingMovies(
      database,
      ['tt0000001'],
    );

    expect(existingByImdbId.size).toBe(0);
    expect([...softDeletedImdbIds]).toEqual(['tt0000001']);
  });

  it('IMDb ID が無ければ空を返す', async () => {
    const database = await createTestDatabase();

    const {existingByImdbId, softDeletedImdbIds} = await loadExistingMovies(
      database,
      [],
    );

    expect(existingByImdbId.size).toBe(0);
    expect(softDeletedImdbIds.size).toBe(0);
  });
});
