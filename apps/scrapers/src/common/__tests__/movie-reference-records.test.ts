import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {posterUrls} from '@shine/database/schema/poster-urls';
import {referenceUrls} from '@shine/database/schema/reference-urls';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {afterEach, describe, expect, it} from 'vitest';
import {
  insertImdbAndTmdbReferenceUrls,
  insertTmdbPosterUrl,
} from '../movie-reference-records';
import {type TMDBConfig} from '@shine/tmdb';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../../packages/database/migrations',
);

let temporaryDirectories: string[] = [];

async function createTestDatabase() {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'shine-reference-records-'),
  );
  temporaryDirectories.push(directory);
  const database = getDatabase({
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
  });
  await migrate(database, {migrationsFolder});
  const [movie] = await database
    .insert(movies)
    .values({originalLanguage: 'en', year: 2024})
    .returning();
  return {database, movieUid: movie.uid};
}

function tmdbConfig(posterSizes: string[]): TMDBConfig {
  return {
    images: {
      secure_base_url: 'https://image.tmdb.org/t/p/',
      poster_sizes: posterSizes,
    },
  } as TMDBConfig;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.map(async directory =>
      fs.rm(directory, {recursive: true, force: true}),
    ),
  );
  temporaryDirectories = [];
});

describe('insertImdbAndTmdbReferenceUrls', () => {
  it('IMDb を主、TMDb を副の参照 URL として保存する', async () => {
    const {database, movieUid} = await createTestDatabase();

    await insertImdbAndTmdbReferenceUrls(database, movieUid, 'tt0111161', 278);

    const rows = await database
      .select()
      .from(referenceUrls)
      .orderBy(referenceUrls.isPrimary);
    expect(rows).toEqual([
      expect.objectContaining({
        url: 'https://www.themoviedb.org/movie/278',
        sourceType: 'other',
        isPrimary: 0,
        description: 'TMDb entry',
      }),
      expect.objectContaining({
        url: 'https://www.imdb.com/title/tt0111161/',
        sourceType: 'imdb',
        isPrimary: 1,
      }),
    ]);
  });

  it('TMDb ID が無ければ IMDb だけ保存する', async () => {
    const {database, movieUid} = await createTestDatabase();

    await insertImdbAndTmdbReferenceUrls(
      database,
      movieUid,
      'tt0111161',
      undefined,
    );

    const rows = await database.select().from(referenceUrls);
    expect(rows.map(row => row.url)).toEqual([
      'https://www.imdb.com/title/tt0111161/',
    ]);
  });

  it('tv なら TMDb の URL を tv にする', async () => {
    const {database, movieUid} = await createTestDatabase();

    await insertImdbAndTmdbReferenceUrls(
      database,
      movieUid,
      'tt0903747',
      1396,
      'tv',
    );

    const rows = await database.select().from(referenceUrls);
    expect(rows.map(row => row.url)).toContain(
      'https://www.themoviedb.org/tv/1396',
    );
  });

  it('再実行しても増えない', async () => {
    const {database, movieUid} = await createTestDatabase();

    await insertImdbAndTmdbReferenceUrls(database, movieUid, 'tt0111161', 278);
    await insertImdbAndTmdbReferenceUrls(database, movieUid, 'tt0111161', 278);

    expect(await database.select().from(referenceUrls)).toHaveLength(2);
  });
});

describe('insertTmdbPosterUrl', () => {
  it('w500 があればその幅で保存する', async () => {
    const {database, movieUid} = await createTestDatabase();

    await insertTmdbPosterUrl(
      database,
      tmdbConfig(['w92', 'w500', 'original']),
      movieUid,
      '/poster.jpg',
    );

    const [row] = await database.select().from(posterUrls);
    expect(row).toMatchObject({
      movieUid,
      url: 'https://image.tmdb.org/t/p/w500/poster.jpg',
      sourceType: 'tmdb',
      isPrimary: 1,
    });
  });

  it('w500 が無ければ original で保存する', async () => {
    const {database, movieUid} = await createTestDatabase();

    await insertTmdbPosterUrl(
      database,
      tmdbConfig(['w92', 'original']),
      movieUid,
      '/poster.jpg',
    );

    const [row] = await database.select().from(posterUrls);
    expect(row.url).toBe('https://image.tmdb.org/t/p/original/poster.jpg');
  });
});
