import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {eq, type getDatabase} from '@shine/database';
import {movieCredits} from '@shine/database/schema/movie-credits';
import {movies} from '@shine/database/schema/movies';
import {translations} from '@shine/database/schema/translations';
import {createD1TestDatabase} from '@shine/database/testing';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {saveMovieCredits} from '../save-credits';
import type {SelectedCredit} from '../select-credits';

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../packages/database/migrations',
);

const CREDIT_COUNT = 150;

const credits: SelectedCredit[] = Array.from(
  {length: CREDIT_COUNT},
  (_, index) => ({
    creditId: `credit-${index}`,
    tmdbPersonId: index + 1,
    name: `Person ${index}`,
    localizedName: `人物${index}`,
    profilePath: undefined,
    department: 'Acting',
    job: 'Actor',
    character: `役${index}`,
    castOrder: index,
  }),
);

describe('saveMovieCredits on D1', () => {
  let database: ReturnType<typeof getDatabase>;
  let dispose: () => Promise<void>;

  beforeAll(async () => {
    ({database, dispose} = await createD1TestDatabase({migrationsFolder}));
    await database.insert(movies).values([
      {uid: 'movie-1', year: 2000},
      {uid: 'movie-2', year: 2001},
    ]);
    await saveMovieCredits({database, isDryRun: false}, 'movie-1', credits);
  }, 120_000);

  afterAll(async () => {
    await dispose?.();
  });

  it('saves every credit of a large cast', async () => {
    const rows = await database
      .select({uid: movieCredits.uid})
      .from(movieCredits)
      .where(eq(movieCredits.movieUid, 'movie-1'));

    expect(rows).toHaveLength(CREDIT_COUNT);
  });

  it('saves the Japanese name of every person', async () => {
    const rows = await database
      .select({uid: translations.uid})
      .from(translations)
      .where(eq(translations.resourceType, 'person_name'));

    expect(rows).toHaveLength(CREDIT_COUNT);
  });

  it(
    'removes every credit that is no longer selected',
    {timeout: 60_000},
    async () => {
      const recast = credits.map(credit => ({
        ...credit,
        creditId: `recast-${credit.creditId}`,
      }));
      await saveMovieCredits({database, isDryRun: false}, 'movie-2', recast);
      await saveMovieCredits({database, isDryRun: false}, 'movie-2', []);

      const rows = await database
        .select({uid: movieCredits.uid})
        .from(movieCredits)
        .where(eq(movieCredits.movieUid, 'movie-2'));

      expect(rows).toHaveLength(0);
    },
  );
});
