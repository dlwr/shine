import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {movieSelections} from '@shine/database/schema/movie-selections';
import {movies} from '@shine/database/schema/movies';
import {translations} from '@shine/database/schema/translations';
import {migrate} from '@shine/database/testing';
import {beforeEach, describe, expect, it} from 'vitest';
import {selectionsRoutes} from '../routes/selections';
import {
  getSelectionDate,
  nextSelectionDates,
} from '../services/selection-dates';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

type NextResponse = {
  date: string;
  movie: {uid: string; title: string};
};

async function createTestEnvironment(): Promise<Environment> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-test-'));
  const environment: Environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});

  await database.insert(movies).values([
    {uid: 'movie-current', year: 2001, originalLanguage: 'en'},
    {uid: 'movie-next', year: 2002, originalLanguage: 'en'},
  ]);
  await database.insert(translations).values([
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-current',
      languageCode: 'en',
      content: 'Current Month',
      isDefault: 1,
    },
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-next',
      languageCode: 'en',
      content: 'Next Month',
      isDefault: 1,
    },
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-next',
      languageCode: 'ja',
      content: '来月の映画',
    },
  ]);

  const next = nextSelectionDates(new Date());
  await database.insert(movieSelections).values([
    {
      selectionType: 'monthly',
      selectionDate: getSelectionDate(new Date(), 'monthly'),
      movieId: 'movie-current',
    },
    {
      selectionType: 'monthly',
      selectionDate: getSelectionDate(next.monthly, 'monthly'),
      movieId: 'movie-next',
    },
  ]);

  return environment;
}

describe('GET /selections/:type/next', () => {
  let environment: Environment;

  beforeEach(async () => {
    environment = await createTestEnvironment();
  });

  it('来月の選出を選出日つきで返す', async () => {
    const response = await selectionsRoutes.request(
      '/selections/monthly/next?locale=ja',
      {},
      environment,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as NextResponse;
    expect(body.date).toBe(
      getSelectionDate(nextSelectionDates(new Date()).monthly, 'monthly'),
    );
    expect(body.movie.uid).toBe('movie-next');
    expect(body.movie.title).toBe('来月の映画');
  });

  it('locale が en なら英語の題名を返す', async () => {
    const response = await selectionsRoutes.request(
      '/selections/monthly/next?locale=en',
      {},
      environment,
    );

    const body = (await response.json()) as NextResponse;
    expect(body.movie.title).toBe('Next Month');
  });

  it('知らない種類は 400 を返す', async () => {
    const response = await selectionsRoutes.request(
      '/selections/yearly/next',
      {},
      environment,
    );

    expect(response.status).toBe(400);
  });
});
