import path from 'node:path';
import {fileURLToPath} from 'node:url';
import type {getDatabase} from '@shine/database';
import {movieCredits} from '@shine/database/schema/movie-credits';
import {movies} from '@shine/database/schema/movies';
import {people} from '@shine/database/schema/people';
import {translations} from '@shine/database/schema/translations';
import {createD1TestDatabase} from '@shine/database/testing';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {loadNominationMovieTitles} from '../nomination-movie-titles';
import {loadPersonDetail} from '../person-detail';

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../packages/database/migrations',
);

const MOVIE_COUNT = 150;
const movieUids = Array.from(
  {length: MOVIE_COUNT},
  (_, index) => `movie-${index}`,
);

describe('lists longer than the D1 bound parameter limit', () => {
  let database: ReturnType<typeof getDatabase>;
  let dispose: () => Promise<void>;

  beforeAll(async () => {
    ({database, dispose} = await createD1TestDatabase({migrationsFolder}));
    await database.insert(people).values({
      uid: 'person-1',
      tmdbId: 1,
      name: '多作の俳優',
    });
    for (const [index, uid] of movieUids.entries()) {
      await database.insert(movies).values({uid, year: 1900 + index});
      await database.insert(translations).values({
        resourceType: 'movie_title',
        resourceUid: uid,
        languageCode: 'ja',
        content: `作品${index}`,
      });
      await database.insert(movieCredits).values({
        movieUid: uid,
        personUid: 'person-1',
        creditId: `credit-${index}`,
        department: 'Acting',
        job: 'Actor',
      });
    }
  }, 120_000);

  afterAll(async () => {
    await dispose?.();
  });

  it('loads a filmography of every credited movie', async () => {
    const detail = await loadPersonDetail(database, 'person-1', 'ja');

    expect(detail?.credits).toHaveLength(MOVIE_COUNT);
  });

  it('loads a title for every nominated movie', async () => {
    const titles = await loadNominationMovieTitles(
      database,
      movieUids.map(movieUid => ({movieUid, movieOriginalLanguage: null})),
    );

    expect(titles.size).toBe(MOVIE_COUNT);
  });
});
