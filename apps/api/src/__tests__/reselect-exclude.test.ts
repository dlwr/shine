import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {translations} from '@shine/database/schema/translations';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {beforeEach, describe, expect, it} from 'vitest';
import {createJWT} from '../auth';
import {selectionsRoutes} from '../routes/selections';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

const JWT_SECRET = 'test-secret';

describe('POST /reselect with excludeMovieUids', () => {
  let environment: Environment;

  beforeEach(async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-test-'));
    environment = {
      TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
      TURSO_AUTH_TOKEN: '',
      JWT_SECRET,
    };
    const database = getDatabase(environment);
    await migrate(database, {migrationsFolder});

    await database
      .insert(awardOrganizations)
      .values({uid: 'org-1', name: 'Test Award'});
    await database
      .insert(awardCeremonies)
      .values({uid: 'ceremony-1', organizationUid: 'org-1', year: 2020});
    await database.insert(awardCategories).values({
      uid: 'category-1',
      organizationUid: 'org-1',
      name: 'Best Picture',
    });
    await database.insert(movies).values({uid: 'movie-a', year: 2020});
    await database.insert(translations).values({
      resourceType: 'movie_title',
      resourceUid: 'movie-a',
      languageCode: 'en',
      content: 'Movie A',
      isDefault: 1,
    });
    await database.insert(nominations).values({
      movieUid: 'movie-a',
      ceremonyUid: 'ceremony-1',
      categoryUid: 'category-1',
    });
  });

  async function postReselect(body: Record<string, unknown>) {
    const token = await createJWT(JWT_SECRET);
    return selectionsRoutes.request(
      '/reselect',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
      environment,
    );
  }

  it('passes excludeMovieUids to the selection so excluded movies fail over', async () => {
    const response = await postReselect({
      type: 'daily',
      excludeMovieUids: ['movie-a'],
    });

    expect(response.status).toBe(500);
  });

  it('rejects non-array excludeMovieUids', async () => {
    const response = await postReselect({
      type: 'daily',
      excludeMovieUids: 'movie-a',
    });

    expect(response.status).toBe(400);
  });

  it('rejects excludeMovieUids containing non-strings', async () => {
    const response = await postReselect({
      type: 'daily',
      excludeMovieUids: [123],
    });

    expect(response.status).toBe(400);
  });

  it('reselects normally without excludeMovieUids', async () => {
    const response = await postReselect({type: 'daily'});

    expect(response.status).toBe(200);
    const body = (await response.json()) as {movie: {uid: string}};
    expect(body.movie.uid).toBe('movie-a');
  });

  it('reselects for a future date when date is given', async () => {
    const response = await postReselect({type: 'daily', date: '2099-01-02'});

    expect(response.status).toBe(200);
    const database = getDatabase(environment);
    const {movieSelections} =
      await import('@shine/database/schema/movie-selections');
    const rows = await database
      .select({selectionDate: movieSelections.selectionDate})
      .from(movieSelections);
    expect(rows).toEqual([{selectionDate: '2099-01-02'}]);
  });

  it('rejects an invalid date format', async () => {
    const response = await postReselect({type: 'daily', date: '2099/01/02'});

    expect(response.status).toBe(400);
  });
});
