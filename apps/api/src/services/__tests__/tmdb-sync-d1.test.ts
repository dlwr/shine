import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {and, eq, type Environment, type getDatabase} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {posterUrls} from '@shine/database/schema/poster-urls';
import {translations} from '@shine/database/schema/translations';
import {createD1TestDatabase} from '@shine/database/testing';
import {afterAll, afterEach, beforeAll, describe, expect, it, vi} from 'vitest';
import {syncTmdbData} from '../tmdb-sync';

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../packages/database/migrations',
);

const languageCodes = Array.from({length: 30}, (_, index) =>
  String.fromCodePoint(97 + Math.floor(index / 26), 97 + (index % 26)),
);

describe('syncTmdbData on D1', () => {
  let database: ReturnType<typeof getDatabase>;
  let environment: Environment;
  let dispose: () => Promise<void>;

  beforeAll(async () => {
    const d1 = await createD1TestDatabase({migrationsFolder});
    ({database, dispose} = d1);
    environment = {DB: d1.binding, TMDB_API_KEY: 'test-key'};
    await database.insert(movies).values([
      {uid: 'many-languages', year: 2015},
      {uid: 'french-film', year: 2015, originalLanguage: 'en'},
    ]);
  }, 60_000);

  afterAll(async () => {
    await dispose?.();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('saves translations beyond the bound parameter limit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        const body = url.includes('/images')
          ? {id: 1, posters: []}
          : url.includes('/translations')
            ? {
                id: 1,
                translations: languageCodes.map(code => ({
                  iso_639_1: code,
                  data: {title: `Title ${code}`},
                })),
              }
            : {original_language: 'en', original_title: 'Title'};
        return {
          ok: true,
          async text() {
            return JSON.stringify(body);
          },
        };
      }),
    );

    await syncTmdbData(database, 'many-languages', 1, 'movie', environment);

    const rows = await database
      .select({languageCode: translations.languageCode})
      .from(translations)
      .where(eq(translations.resourceUid, 'many-languages'));
    expect(rows).toHaveLength(30);
  });
  it('marks the poster in the original language from TMDb as primary', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        const body = url.includes('/images')
          ? {
              id: 2,
              posters: [
                {
                  file_path: '/en.jpg',
                  width: 500,
                  height: 750,
                  iso_639_1: 'en',
                },
                {
                  file_path: '/fr.jpg',
                  width: 500,
                  height: 750,
                  iso_639_1: 'fr',
                },
              ],
            }
          : url.includes('/translations')
            ? {id: 2, translations: []}
            : {original_language: 'fr', original_title: 'Titre'};
        return {
          ok: true,
          async text() {
            return JSON.stringify(body);
          },
        };
      }),
    );

    await syncTmdbData(database, 'french-film', 2, 'movie', environment);

    const rows = await database
      .select({url: posterUrls.url})
      .from(posterUrls)
      .where(
        and(
          eq(posterUrls.movieUid, 'french-film'),
          eq(posterUrls.isPrimary, 1),
        ),
      );
    expect(rows).toEqual([{url: 'https://image.tmdb.org/t/p/original/fr.jpg'}]);
  });
});
