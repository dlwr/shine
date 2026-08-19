import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {eq} from 'drizzle-orm';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {getScrapeDatabase} from '../common/dry-run';
import {fixOriginalLanguages} from '../fix-original-languages';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

vi.stubGlobal('fetch', vi.fn());

function stubTmdbDetails(details: unknown) {
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    text: async () => JSON.stringify(details),
  } as unknown as Response);
}

function tmdbMovie(originalLanguage: string | undefined) {
  return {
    id: 758_866,
    title: 'ドライブ・マイ・カー',
    original_title: 'ドライブ・マイ・カー',
    original_language: originalLanguage,
    release_date: '2021-08-20',
  };
}

let temporaryDirectories: string[] = [];

async function createTestDatabase(originalLanguage = 'en') {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-language-'));
  temporaryDirectories.push(directory);
  const environment: Environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
    TMDB_API_KEY: 'test-key',
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});
  const [movie] = await database
    .insert(movies)
    .values({originalLanguage, year: 2021, tmdbId: 758_866})
    .returning();
  return {database, environment, movieUid: movie.uid};
}

async function languageOf(
  database: ReturnType<typeof getDatabase>,
  movieUid: string,
): Promise<string> {
  const [movie] = await database
    .select()
    .from(movies)
    .where(eq(movies.uid, movieUid));
  return movie.originalLanguage;
}

beforeEach(() => {
  vi.mocked(fetch).mockClear();
});

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.map(async directory =>
      fs.rm(directory, {recursive: true, force: true}),
    ),
  );
  temporaryDirectories = [];
});

describe('fixOriginalLanguages', () => {
  it('TMDbと食い違う原語を書き換える', async () => {
    const {database, environment, movieUid} = await createTestDatabase('en');
    stubTmdbDetails(tmdbMovie('ja'));

    await fixOriginalLanguages({database, environment, isDryRun: false});

    expect(await languageOf(database, movieUid)).toBe('ja');
  });

  it('書き換えた件数を返す', async () => {
    const {database, environment} = await createTestDatabase('en');
    stubTmdbDetails(tmdbMovie('ja'));

    const result = await fixOriginalLanguages({
      database,
      environment,
      isDryRun: false,
    });

    expect(result.updated).toBe(1);
  });

  it('一致していれば書き換えない', async () => {
    const {database, environment} = await createTestDatabase('ja');
    stubTmdbDetails(tmdbMovie('ja'));

    const result = await fixOriginalLanguages({
      database,
      environment,
      isDryRun: false,
    });

    expect(result.updated).toBe(0);
  });

  it('TMDbに原語が無ければ書き換えない', async () => {
    const {database, environment, movieUid} = await createTestDatabase('en');
    stubTmdbDetails(tmdbMovie(undefined));

    await fixOriginalLanguages({database, environment, isDryRun: false});

    expect(await languageOf(database, movieUid)).toBe('en');
  });

  it('無言語(xx)には書き換えない', async () => {
    const {database, environment, movieUid} = await createTestDatabase('en');
    stubTmdbDetails(tmdbMovie('xx'));

    await fixOriginalLanguages({database, environment, isDryRun: false});

    expect(await languageOf(database, movieUid)).toBe('en');
  });

  it('soft-delete された映画は対象にしない', async () => {
    const {database, environment, movieUid} = await createTestDatabase('en');
    await database
      .update(movies)
      .set({deletedAt: 1_700_000_000})
      .where(eq(movies.uid, movieUid));
    stubTmdbDetails(tmdbMovie('ja'));

    await fixOriginalLanguages({database, environment, isDryRun: false});

    expect(await languageOf(database, movieUid)).toBe('en');
  });

  it('tmdbId のない映画は問い合わせない', async () => {
    const {database, environment, movieUid} = await createTestDatabase('en');
    await database.delete(movies).where(eq(movies.uid, movieUid));
    await database.insert(movies).values({originalLanguage: 'en', year: 1960});

    await fixOriginalLanguages({database, environment, isDryRun: false});

    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('dry-run では書き換えない', async () => {
    const {database, environment, movieUid} = await createTestDatabase('en');
    const dryRunDatabase = getScrapeDatabase({environment, isDryRun: true});
    stubTmdbDetails(tmdbMovie('ja'));

    await fixOriginalLanguages({
      database: dryRunDatabase,
      environment,
      isDryRun: true,
    });

    expect(await languageOf(database, movieUid)).toBe('en');
  });

  it('dry-run でも書き換え対象の件数は数える', async () => {
    const {environment} = await createTestDatabase('en');
    const dryRunDatabase = getScrapeDatabase({environment, isDryRun: true});
    stubTmdbDetails(tmdbMovie('ja'));

    const result = await fixOriginalLanguages({
      database: dryRunDatabase,
      environment,
      isDryRun: true,
    });

    expect(result.updated).toBe(1);
  });

  it('limit を超える映画は処理しない', async () => {
    const {database, environment} = await createTestDatabase('en');
    await database
      .insert(movies)
      .values({originalLanguage: 'en', year: 2023, tmdbId: 976_893});
    stubTmdbDetails(tmdbMovie('ja'));

    const result = await fixOriginalLanguages(
      {database, environment, isDryRun: false},
      {limit: 1},
    );

    expect(result.updated).toBe(1);
  });
});
