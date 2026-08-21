import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {translations} from '@shine/database/schema/translations';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {afterEach, describe, expect, it} from 'vitest';
import {buildTitleRows, resolveMovieUid} from '../cannes-film-festival';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

let temporaryDirectories: string[] = [];

async function createTestDatabase() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-cannes-'));
  temporaryDirectories.push(directory);
  const environment: Environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
  };
  const database = getDatabase(environment);
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

describe('resolveMovieUid', () => {
  it('デフォルトでない英語タイトルでも既存映画を照合する', async () => {
    const database = await createTestDatabase();
    const [movie] = await database
      .insert(movies)
      .values({originalLanguage: 'ja', year: 1954})
      .returning();
    await database.insert(translations).values([
      {
        resourceType: 'movie_title',
        resourceUid: movie.uid,
        languageCode: 'en',
        content: 'Gate of Hell',
        isDefault: 0,
      },
      {
        resourceType: 'movie_title',
        resourceUid: movie.uid,
        languageCode: 'ja',
        content: '地獄門',
        isDefault: 1,
      },
    ]);

    const resolution = await resolveMovieUid(
      database,
      {title: 'Gate of Hell', year: 1954, isWinner: true},
      {},
    );

    expect(resolution.wasExisting).toBe(true);
    expect(resolution.movieUid).toBe(movie.uid);
  });
});

describe('buildTitleRows', () => {
  it('新規作成で原語が日本語なら日本語タイトルがデフォルトになる', () => {
    const rows = buildTitleRows(
      'movie-1',
      'Gate of Hell',
      {japaneseTitle: '地獄門', originalLanguage: 'ja'},
      false,
    );

    const byLanguage = new Map(rows.map(row => [row.languageCode, row]));
    expect(byLanguage.get('ja')?.isDefault).toBe(1);
    expect(byLanguage.get('en')?.isDefault).toBe(0);
  });

  it('新規作成で原語がフランス語なら英語タイトルがデフォルトになる', () => {
    const rows = buildTitleRows(
      'movie-1',
      'The Wages of Fear',
      {japaneseTitle: '恐怖の報酬', originalLanguage: 'fr'},
      false,
    );

    const byLanguage = new Map(rows.map(row => [row.languageCode, row]));
    expect(byLanguage.get('en')?.isDefault).toBe(1);
    expect(byLanguage.get('ja')?.isDefault).toBe(0);
  });

  it('既存映画への邦題追記はデフォルトにしない', () => {
    const rows = buildTitleRows(
      'movie-1',
      'The Wages of Fear',
      {japaneseTitle: '恐怖の報酬', originalLanguage: 'fr'},
      true,
    );

    expect(rows).toEqual([
      expect.objectContaining({languageCode: 'ja', isDefault: 0}),
    ]);
  });
});
