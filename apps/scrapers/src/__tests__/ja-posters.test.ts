import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {eq} from 'drizzle-orm';
import {getDatabase, type Environment} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movieSelections} from '@shine/database/schema/movie-selections';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {posterUrls} from '@shine/database/schema/poster-urls';
import {translations} from '@shine/database/schema/translations';
import {migrate} from '@shine/database/testing';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {findJaPosterCandidates, syncJaPosters} from '../ja-posters';

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../packages/database/migrations',
);

type Database = ReturnType<typeof getDatabase>;

async function createTestEnvironment(): Promise<{
  environment: Environment;
  database: Database;
}> {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'shine-ja-poster-'),
  );
  const environment: Environment = {
    DATABASE_FILE_URL: `file:${path.join(directory, 'test.db')}`,
    TMDB_API_KEY: 'test-key',
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});
  await database
    .insert(awardOrganizations)
    .values({uid: 'org', name: 'Academy Awards'});
  await database
    .insert(awardCeremonies)
    .values({uid: 'ceremony', organizationUid: 'org', year: 1987});
  await database
    .insert(awardCategories)
    .values({uid: 'category', organizationUid: 'org', name: 'Best Picture'});
  return {environment, database};
}

async function seedMovie(
  database: Database,
  values: {
    uid: string;
    tmdbId?: number;
    jaTitle?: string;
    originalLanguage?: string;
    deletedAt?: number;
    posterLanguage?: string;
  },
): Promise<void> {
  await database.insert(movies).values({
    uid: values.uid,
    tmdbId: 'tmdbId' in values ? values.tmdbId : 100,
    year: 1986,
    originalLanguage: values.originalLanguage ?? 'en',
    deletedAt: values.deletedAt,
  });
  if (!('jaTitle' in values) || values.jaTitle) {
    await database.insert(translations).values({
      resourceType: 'movie_title',
      resourceUid: values.uid,
      languageCode: 'ja',
      content: values.jaTitle ?? 'ミッション',
    });
  }

  if (values.posterLanguage) {
    await database.insert(posterUrls).values({
      movieUid: values.uid,
      url: `https://image.tmdb.org/t/p/original/${values.uid}.jpg`,
      languageCode: values.posterLanguage,
    });
  }
}

async function candidateUids(environment: Environment): Promise<string[]> {
  const candidates = await findJaPosterCandidates({
    environment,
    today: '2026-10-05',
  });
  return candidates.map(candidate => candidate.uid);
}

describe('findJaPosterCandidates', () => {
  let environment: Environment;
  let database: Database;

  beforeEach(async () => {
    ({environment, database} = await createTestEnvironment());
  });

  it('lists a foreign movie with a Japanese title and no Japanese poster', async () => {
    await seedMovie(database, {uid: 'mission', posterLanguage: 'en'});

    expect(await candidateUids(environment)).toEqual(['mission']);
  });

  it('skips movies that already have a Japanese poster', async () => {
    await seedMovie(database, {uid: 'done', posterLanguage: 'ja'});

    expect(await candidateUids(environment)).toEqual([]);
  });

  it('skips Japanese movies', async () => {
    await seedMovie(database, {uid: 'japanese', originalLanguage: 'ja'});

    expect(await candidateUids(environment)).toEqual([]);
  });

  it('skips movies without a Japanese title', async () => {
    await seedMovie(database, {uid: 'untitled', jaTitle: undefined});

    expect(await candidateUids(environment)).toEqual([]);
  });

  it('skips movies without a TMDb ID', async () => {
    await seedMovie(database, {uid: 'no-tmdb', tmdbId: undefined});

    expect(await candidateUids(environment)).toEqual([]);
  });

  it('skips soft-deleted movies', async () => {
    await seedMovie(database, {uid: 'deleted', deletedAt: 1});

    expect(await candidateUids(environment)).toEqual([]);
  });

  it('puts current selections first, then winners, then the rest', async () => {
    await seedMovie(database, {uid: 'other', tmdbId: 1});
    await seedMovie(database, {uid: 'winner', tmdbId: 2});
    await seedMovie(database, {uid: 'past-selection', tmdbId: 3});
    await seedMovie(database, {uid: 'monthly', tmdbId: 4});
    await database.insert(nominations).values({
      movieUid: 'winner',
      ceremonyUid: 'ceremony',
      categoryUid: 'category',
      isWinner: 1,
    });
    await database.insert(movieSelections).values([
      {
        selectionType: 'monthly',
        selectionDate: '2026-10-01',
        movieId: 'monthly',
      },
      {
        selectionType: 'monthly',
        selectionDate: '2026-09-01',
        movieId: 'past-selection',
      },
    ]);

    expect(await candidateUids(environment)).toEqual([
      'monthly',
      'winner',
      'other',
      'past-selection',
    ]);
  });
});

describe('syncJaPosters', () => {
  let environment: Environment;
  let database: Database;

  beforeEach(async () => {
    ({environment, database} = await createTestEnvironment());
    await seedMovie(database, {uid: 'mission', tmdbId: 11_416});
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        async text() {
          return JSON.stringify({
            id: 11_416,
            posters: [
              {file_path: '/en.jpg', width: 500, height: 750, iso_639_1: 'en'},
              {file_path: '/ja.jpg', width: 500, height: 750, iso_639_1: 'ja'},
            ],
          });
        },
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const savedUrls = async () => {
    const rows = await database
      .select({url: posterUrls.url})
      .from(posterUrls)
      .where(eq(posterUrls.movieUid, 'mission'));
    return rows.map(row => row.url);
  };

  it('saves only the Japanese posters found on TMDb', async () => {
    const candidates = await findJaPosterCandidates({
      environment,
      today: '2026-10-05',
    });

    await syncJaPosters({
      environment,
      candidates,
      isDryRun: false,
      throttleMs: 0,
    });

    expect(await savedUrls()).toEqual([
      'https://image.tmdb.org/t/p/original/ja.jpg',
    ]);
  });

  it('reports the movies whose Japanese poster was found', async () => {
    const candidates = await findJaPosterCandidates({
      environment,
      today: '2026-10-05',
    });

    const stats = await syncJaPosters({
      environment,
      candidates,
      isDryRun: false,
      throttleMs: 0,
    });

    expect(stats).toEqual({checked: 1, found: 1, failed: 0});
  });

  it('writes nothing on a dry run', async () => {
    const candidates = await findJaPosterCandidates({
      environment,
      today: '2026-10-05',
    });

    await syncJaPosters({
      environment,
      candidates,
      isDryRun: true,
      throttleMs: 0,
    });

    expect(await savedUrls()).toEqual([]);
  });
  it('asks TMDb for the Japanese images only', async () => {
    const candidates = await findJaPosterCandidates({
      environment,
      today: '2026-10-05',
    });

    await syncJaPosters({
      environment,
      candidates,
      isDryRun: true,
      throttleMs: 0,
    });

    const [[url]] = vi.mocked(fetch).mock.calls;
    expect(
      new URL(String(url)).searchParams.get('include_image_language'),
    ).toBe('ja');
  });
});
