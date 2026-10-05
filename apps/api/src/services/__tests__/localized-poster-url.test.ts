import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {eq, getDatabase} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {posterUrls} from '@shine/database/schema/poster-urls';
import {migrate} from '@shine/database/testing';
import {beforeEach, describe, expect, it} from 'vitest';
import {localizedPosterUrl} from '../localized-poster-url';

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../packages/database/migrations',
);

type Poster = {url: string; languageCode?: string; isPrimary?: number};

describe('localizedPosterUrl', () => {
  let database: ReturnType<typeof getDatabase>;

  beforeEach(async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-test-'));
    database = getDatabase({
      DATABASE_FILE_URL: `file:${path.join(directory, 'test.db')}`,
    });
    await migrate(database, {migrationsFolder});
    await database.insert(movies).values({uid: 'movie-1', year: 2015});
  });

  const pick = async (posters: Poster[], locale: string) => {
    await database.insert(posterUrls).values(
      posters.map((poster, index) => ({
        movieUid: 'movie-1',
        createdAt: 1000 + index,
        ...poster,
      })),
    );
    const [row] = await database
      .select({posterUrl: localizedPosterUrl(locale)})
      .from(movies)
      .where(eq(movies.uid, 'movie-1'));
    return row.posterUrl;
  };

  it('prefers a poster in the locale language over the primary one', async () => {
    expect(
      await pick(
        [
          {url: 'en-primary', languageCode: 'en', isPrimary: 1},
          {url: 'ja', languageCode: 'ja'},
        ],
        'ja',
      ),
    ).toBe('ja');
  });

  it('prefers the primary poster among those in the locale language', async () => {
    expect(
      await pick(
        [
          {url: 'ja', languageCode: 'ja'},
          {url: 'ja-primary', languageCode: 'ja', isPrimary: 1},
        ],
        'ja',
      ),
    ).toBe('ja-primary');
  });

  it('falls back to the primary poster without a language', async () => {
    expect(
      await pick(
        [
          {url: 'fr-primary', languageCode: 'fr', isPrimary: 1},
          {url: 'no-language-primary', isPrimary: 1},
        ],
        'ja',
      ),
    ).toBe('no-language-primary');
  });

  it('falls back to any primary poster', async () => {
    expect(
      await pick(
        [
          {url: 'fr', languageCode: 'fr'},
          {url: 'en-primary', languageCode: 'en', isPrimary: 1},
        ],
        'ja',
      ),
    ).toBe('en-primary');
  });

  it('falls back to the oldest poster', async () => {
    expect(
      await pick(
        [
          {url: 'fr-old', languageCode: 'fr'},
          {url: 'de-new', languageCode: 'de'},
          {url: 'it-newest', languageCode: 'it'},
        ],
        'ja',
      ),
    ).toBe('fr-old');
  });

  it('matches the language part of a regional locale', async () => {
    expect(
      await pick(
        [
          {url: 'en-primary', languageCode: 'en', isPrimary: 1},
          {url: 'ja', languageCode: 'ja'},
        ],
        'ja-JP',
      ),
    ).toBe('ja');
  });
});
