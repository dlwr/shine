import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movieSelections} from '@shine/database/schema/movie-selections';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {translations} from '@shine/database/schema/translations';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {beforeEach, describe, expect, it} from 'vitest';
import {EdgeCache} from '../../utils/cache';
import {SelectionsService} from '../selections-service';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../../packages/database/migrations',
);

type TestDatabase = ReturnType<typeof getDatabase>;

async function createTestEnvironment(): Promise<{
  environment: Environment;
  database: TestDatabase;
}> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-test-'));
  const environment: Environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
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

  return {environment, database};
}

async function seedNominatedMovie(
  database: TestDatabase,
  uid: string,
  title: string,
): Promise<void> {
  await database.insert(movies).values({uid, year: 2020});
  await database.insert(translations).values({
    resourceType: 'movie_title',
    resourceUid: uid,
    languageCode: 'en',
    content: title,
    isDefault: 1,
  });
  await database.insert(nominations).values({
    movieUid: uid,
    ceremonyUid: 'ceremony-1',
    categoryUid: 'category-1',
  });
}

function createMemoryCache(): EdgeCache {
  const store = new Map<string, string>();
  const kv = {
    async get(key: string, type?: string) {
      const raw = store.get(key);
      if (raw === undefined) {
        // eslint-disable-next-line unicorn/no-null -- KVNamespace.get returns null for missing keys
        return null;
      }

      return type === 'json' ? JSON.parse(raw) : raw;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
  } as unknown as KVNamespace;

  return new EdgeCache(undefined, kv);
}

describe('SelectionsService.reselectMovie with excludeMovieUids', () => {
  let environment: Environment;
  let database: TestDatabase;

  beforeEach(async () => {
    ({environment, database} = await createTestEnvironment());
  });

  it('throws when every nominated movie is excluded', async () => {
    await seedNominatedMovie(database, 'movie-a', 'Movie A');
    const service = new SelectionsService(environment);

    await expect(
      service.reselectMovie('daily', 'en', new Date('2026-07-15'), ['movie-a']),
    ).rejects.toThrow('No movies available for selection');
  });

  it('never selects an excluded movie', async () => {
    await seedNominatedMovie(database, 'movie-a', 'Movie A');
    await seedNominatedMovie(database, 'movie-b', 'Movie B');
    const service = new SelectionsService(environment);

    for (let index = 0; index < 10; index++) {
      const movie = await service.reselectMovie(
        'daily',
        'en',
        new Date('2026-07-15'),
        ['movie-a'],
      );
      expect(movie.uid).toBe('movie-b');
    }
  });

  it('includes latest ok availability records in the movie payload', async () => {
    await seedNominatedMovie(database, 'movie-a', 'Movie A');
    const {movieAvailabilityChecks} =
      await import('@shine/database/schema/movie-availability-checks');
    await database.insert(movieAvailabilityChecks).values([
      {
        movieUid: 'movie-a',
        source: 'tmdb',
        status: 'ok',
        detail: 'U-NEXT(見放題)',
        checkedAt: 1000,
      },
      {
        movieUid: 'movie-a',
        source: 'tmdb',
        status: 'ok',
        detail: 'Hulu(見放題)',
        checkedAt: 2000,
      },
      {
        movieUid: 'movie-a',
        source: 'geo',
        status: 'ng',
        detail: 'No match',
        checkedAt: 2000,
      },
      {
        movieUid: 'movie-a',
        source: 'discas',
        status: 'ok',
        detail: 'Matched: Movie A',
        checkedAt: 2000,
      },
    ]);
    const service = new SelectionsService(environment);

    const movie = await service.reselectMovie(
      'daily',
      'en',
      new Date('2026-07-15'),
    );

    expect(movie.availability).toEqual([
      {source: 'tmdb', detail: 'Hulu(見放題)', checkedAt: 2000},
      {source: 'discas', detail: 'Matched: Movie A', checkedAt: 2000},
    ]);
  });

  it('returns an empty availability array when no checks exist', async () => {
    await seedNominatedMovie(database, 'movie-a', 'Movie A');
    const service = new SelectionsService(environment);

    const movie = await service.reselectMovie(
      'daily',
      'en',
      new Date('2026-07-15'),
    );

    expect(movie.availability).toEqual([]);
  });

  it('reselects normally when excludeMovieUids is omitted', async () => {
    await seedNominatedMovie(database, 'movie-a', 'Movie A');
    const service = new SelectionsService(environment);

    const movie = await service.reselectMovie(
      'daily',
      'en',
      new Date('2026-07-15'),
    );
    expect(movie.uid).toBe('movie-a');
  });
});

describe('SelectionsService selection persistence', () => {
  let environment: Environment;
  let database: TestDatabase;

  beforeEach(async () => {
    ({environment, database} = await createTestEnvironment());
  });

  it('does not create duplicate rows when the same period is persisted twice', async () => {
    await seedNominatedMovie(database, 'movie-a', 'Movie A');
    const service = new SelectionsService(environment);
    const date = new Date('2026-07-15');

    await service['selectMovieFromNominations'](date, 'daily', true, 42);
    await service['selectMovieFromNominations'](date, 'daily', true, 42);

    const rows = await database
      .select({uid: movieSelections.uid})
      .from(movieSelections);
    expect(rows).toHaveLength(1);
  });
});

describe('SelectionsService nomination payload', () => {
  let environment: Environment;
  let database: TestDatabase;

  beforeEach(async () => {
    ({environment, database} = await createTestEnvironment());
  });

  it('includes the award page slug for organizations that have one', async () => {
    await database
      .insert(awardOrganizations)
      .values({uid: 'org-cannes', name: 'Cannes Film Festival'});
    await database.insert(awardCeremonies).values({
      uid: 'ceremony-cannes',
      organizationUid: 'org-cannes',
      year: 2020,
    });
    await database.insert(awardCategories).values({
      uid: 'category-palme',
      organizationUid: 'org-cannes',
      name: "Palme d'Or",
    });
    await database.insert(movies).values({uid: 'movie-c', year: 2020});
    await database.insert(translations).values({
      resourceType: 'movie_title',
      resourceUid: 'movie-c',
      languageCode: 'en',
      content: 'Movie C',
      isDefault: 1,
    });
    await database.insert(nominations).values({
      movieUid: 'movie-c',
      ceremonyUid: 'ceremony-cannes',
      categoryUid: 'category-palme',
    });
    const service = new SelectionsService(environment);

    const movie = await service.reselectMovie(
      'daily',
      'en',
      new Date('2026-07-15'),
    );

    expect(movie.nominations[0].organization.slug).toBe('palme-dor');
    expect(movie.nominations[0].organization.hasYearPages).toBe(true);
  });

  it('leaves the slug undefined for organizations without an award page', async () => {
    await seedNominatedMovie(database, 'movie-a', 'Movie A');
    const service = new SelectionsService(environment);

    const movie = await service.reselectMovie(
      'daily',
      'en',
      new Date('2026-07-15'),
    );

    expect(movie.nominations[0].organization.slug).toBeUndefined();
  });
});

describe('SelectionsService.getNextPeriodPreviews', () => {
  let environment: Environment;
  let database: TestDatabase;

  beforeEach(async () => {
    ({environment, database} = await createTestEnvironment());
  });

  it('returns the reselected movie immediately after a reselect', async () => {
    await seedNominatedMovie(database, 'movie-a', 'Movie A');
    await seedNominatedMovie(database, 'movie-b', 'Movie B');
    const service = new SelectionsService(environment, createMemoryCache());

    const before = await service.getNextPeriodPreviews('ja');
    const initialUid = before.nextDaily.movie?.uid;
    await service.reselectMovie(
      'daily',
      'ja',
      new Date(`${before.nextDaily.date}T12:00:00`),
      [initialUid!],
    );

    const after = await service.getNextPeriodPreviews('ja');

    expect(after.nextDaily.movie?.uid).not.toBe(initialUid);
  });
});
