import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {and, eq, getDatabase, type Environment} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {translations} from '@shine/database/schema/translations';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {syncTmdbData} from '../tmdb-sync';

vi.mock('@shine/scrapers/common/tmdb-utilities', () => ({
  fetchTMDBMovieTranslations: vi.fn(async () => ({
    id: 42,
    translations: [
      {iso_639_1: 'en', data: {title: 'New EN Title'}},
      {iso_639_1: 'fr', data: {title: 'Titre FR'}},
      {iso_639_1: 'ja', data: {title: 'JA翻訳タイトル'}},
      {iso_639_1: 'xx', data: {}},
    ],
  })),
  savePosterUrls: vi.fn(async () => 2),
}));

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../../packages/database/migrations',
);

describe('syncTmdbData', () => {
  let environment: Environment;
  let database: ReturnType<typeof getDatabase>;

  beforeEach(async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-test-'));
    environment = {
      TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
      TURSO_AUTH_TOKEN: '',
      TMDB_API_KEY: 'test-key',
    };
    database = getDatabase(environment);
    await migrate(database, {migrationsFolder});

    await database
      .insert(movies)
      .values({uid: 'movie-a', year: 2020, originalLanguage: 'en'});
    await database.insert(translations).values({
      resourceType: 'movie_title',
      resourceUid: 'movie-a',
      languageCode: 'en',
      content: 'Old EN Title',
      isDefault: 1,
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.includes('/images')) {
          return {
            ok: true,
            async json() {
              return {
                id: 42,
                posters: [
                  {file_path: '/a.jpg', width: 500, height: 750, iso_639_1: 'en'},
                ],
              };
            },
          };
        }

        return {
          ok: true,
          async json() {
            return {original_language: 'ja', original_title: '原題'};
          },
        };
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('saves posters and reports the saved count', async () => {
    const result = await syncTmdbData(
      database,
      'movie-a',
      42,
      'movie',
      environment,
    );

    expect(result.postersAdded).toBe(2);
  });

  it('counts the original title and every translated title', async () => {
    const result = await syncTmdbData(
      database,
      'movie-a',
      42,
      'movie',
      environment,
    );

    expect(result.translationsAdded).toBe(4);
  });

  it('updates the movie original language from TMDb', async () => {
    await syncTmdbData(database, 'movie-a', 42, 'movie', environment);

    const [movie] = await database
      .select({originalLanguage: movies.originalLanguage})
      .from(movies)
      .where(eq(movies.uid, 'movie-a'));
    expect(movie.originalLanguage).toBe('ja');
  });

  it('overwrites an existing translation on conflict', async () => {
    await syncTmdbData(database, 'movie-a', 42, 'movie', environment);

    const [en] = await database
      .select({content: translations.content, isDefault: translations.isDefault})
      .from(translations)
      .where(
        and(
          eq(translations.resourceUid, 'movie-a'),
          eq(translations.languageCode, 'en'),
        ),
      );
    expect(en.content).toBe('New EN Title');
    expect(en.isDefault).toBe(0);
  });

  it('stores the TMDb-provided title for the original language as default', async () => {
    await syncTmdbData(database, 'movie-a', 42, 'movie', environment);

    const [ja] = await database
      .select({content: translations.content, isDefault: translations.isDefault})
      .from(translations)
      .where(
        and(
          eq(translations.resourceUid, 'movie-a'),
          eq(translations.languageCode, 'ja'),
        ),
      );
    expect(ja.content).toBe('JA翻訳タイトル');
    expect(ja.isDefault).toBe(1);
  });

  it('inserts newly provided languages', async () => {
    await syncTmdbData(database, 'movie-a', 42, 'movie', environment);

    const rows = await database
      .select({languageCode: translations.languageCode})
      .from(translations)
      .where(eq(translations.resourceUid, 'movie-a'));
    const languages = new Set(rows.map(row => row.languageCode));
    expect(languages).toEqual(new Set(['en', 'fr', 'ja']));
  });

  it('throws when the TMDb API key is not configured', async () => {
    await expect(
      syncTmdbData(database, 'movie-a', 42, 'movie', {
        ...environment,
        TMDB_API_KEY: undefined,
      }),
    ).rejects.toThrow('TMDb API key not configured');
  });
});
