import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {eq} from 'drizzle-orm';
import {getDatabase, type Environment} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {translations} from '@shine/database/schema/translations';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {deleteOrphanMovies, isSameFilm} from '../delete-orphan-movies';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

async function createTestEnvironment(): Promise<{
  environment: Environment;
  database: ReturnType<typeof getDatabase>;
}> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-orphan-'));
  const environment: Environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
    TMDB_API_KEY: 'test-key',
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});
  await database
    .insert(awardOrganizations)
    .values({uid: 'org', name: 'Cannes Film Festival'});
  await database
    .insert(awardCategories)
    .values({uid: 'cat', organizationUid: 'org', name: "Palme d'Or"});
  await database
    .insert(awardCeremonies)
    .values({uid: 'ceremony', organizationUid: 'org', year: 2023});
  return {environment, database};
}

async function seedMovie(
  database: ReturnType<typeof getDatabase>,
  values: {
    uid: string;
    title: string;
    year?: number;
    imdbId?: string;
    nominated?: boolean;
  },
): Promise<void> {
  await database
    .insert(movies)
    .values({uid: values.uid, year: values.year, imdbId: values.imdbId});
  await database.insert(translations).values({
    resourceType: 'movie_title',
    resourceUid: values.uid,
    languageCode: 'en',
    content: values.title,
    isDefault: 1,
  });
  if (values.nominated) {
    await database.insert(nominations).values({
      movieUid: values.uid,
      ceremonyUid: 'ceremony',
      categoryUid: 'cat',
    });
  }
}

describe('isSameFilm', () => {
  it('タイトルが一致すれば同じ作品とみなす', () => {
    expect(isSameFilm('The Class', 'The Class')).toBe(true);
  });

  it('表記ゆれを吸収する', () => {
    expect(isSameFilm('Rashômon', 'Rashomon')).toBe(true);
    expect(isSameFilm('Spider-Man', 'Spider Man')).toBe(true);
  });

  it('別の作品なら一致しない', () => {
    expect(isSameFilm('The Class', 'Front of the Class')).toBe(false);
  });

  it('IMDb側が不明なら判定できない', () => {
    expect(isSameFilm('The Class')).toBeUndefined();
  });
});

const stubTmdb = (byImdbId: Record<string, string | undefined>) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      for (const [imdbId, title] of Object.entries(byImdbId)) {
        if (url.includes(`/find/${imdbId}`)) {
          return Response.json({
            movie_results: title ? [{id: 1, title}] : [],
            tv_results: [],
          });
        }
      }

      return new Response('nf', {status: 404});
    }),
  );
};

describe('deleteOrphanMovies', () => {
  let environment: Environment;
  let database: ReturnType<typeof getDatabase>;

  beforeEach(async () => {
    ({environment, database} = await createTestEnvironment());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('ノミネーションがある映画は削除しない', async () => {
    await seedMovie(database, {uid: 'keep', title: 'Keeper', nominated: true});
    stubTmdb({});

    const stats = await deleteOrphanMovies({environment, throttleMs: 0});

    expect(stats.candidates).toBe(0);
    const [movie] = await database
      .select()
      .from(movies)
      .where(eq(movies.uid, 'keep'));
    expect(movie.deletedAt).toBeNull();
  });

  it('ノミネーションが無い映画をソフト削除する', async () => {
    await seedMovie(database, {uid: 'orphan', title: 'Lonely', year: 2020});
    stubTmdb({});

    const stats = await deleteOrphanMovies({environment, throttleMs: 0});

    expect(stats.deleted).toBe(1);
    const [movie] = await database
      .select()
      .from(movies)
      .where(eq(movies.uid, 'orphan'));
    expect(movie.deletedAt).not.toBeNull();
  });

  it('IMDb IDが誤っている映画はIDも空にする', async () => {
    await seedMovie(database, {
      uid: 'orphan',
      title: 'The Class',
      year: 2008,
      imdbId: 'tt1292594',
    });
    stubTmdb({tt1292594: 'Front of the Class'});

    const stats = await deleteOrphanMovies({environment, throttleMs: 0});

    expect(stats.misidentified).toBe(1);
    const [movie] = await database
      .select()
      .from(movies)
      .where(eq(movies.uid, 'orphan'));
    expect(movie.deletedAt).not.toBeNull();
    expect(movie.imdbId).toBeNull();
    expect(movie.tmdbId).toBeNull();
  });

  it('IMDb IDが正しい映画はIDを残したまま削除する', async () => {
    await seedMovie(database, {
      uid: 'orphan',
      title: 'The Class',
      year: 2008,
      imdbId: 'tt1068646',
    });
    stubTmdb({tt1068646: 'The Class'});

    const stats = await deleteOrphanMovies({environment, throttleMs: 0});

    expect(stats.misidentified).toBe(0);
    expect(stats.deleted).toBe(1);
    const [movie] = await database
      .select()
      .from(movies)
      .where(eq(movies.uid, 'orphan'));
    expect(movie.deletedAt).not.toBeNull();
    expect(movie.imdbId).toBe('tt1068646');
  });

  it('IMDb側が確認できない映画はIDを残す', async () => {
    await seedMovie(database, {
      uid: 'orphan',
      title: 'Obscure',
      year: 1950,
      imdbId: 'tt0000001',
    });
    stubTmdb({tt0000001: undefined});

    const stats = await deleteOrphanMovies({environment, throttleMs: 0});

    expect(stats.unverified).toBe(1);
    const [movie] = await database
      .select()
      .from(movies)
      .where(eq(movies.uid, 'orphan'));
    expect(movie.imdbId).toBe('tt0000001');
    expect(movie.deletedAt).not.toBeNull();
  });

  it('既にソフト削除済みの映画は対象にしない', async () => {
    await seedMovie(database, {uid: 'gone', title: 'Gone'});
    await database
      .update(movies)
      .set({deletedAt: 1000})
      .where(eq(movies.uid, 'gone'));
    stubTmdb({});

    const stats = await deleteOrphanMovies({environment, throttleMs: 0});

    expect(stats.candidates).toBe(0);
  });

  it('dryRunでは書き込まない', async () => {
    await seedMovie(database, {uid: 'orphan', title: 'Lonely', year: 2020});
    stubTmdb({});

    const stats = await deleteOrphanMovies({
      environment,
      throttleMs: 0,
      dryRun: true,
    });

    expect(stats.deleted).toBe(1);
    const [movie] = await database
      .select()
      .from(movies)
      .where(eq(movies.uid, 'orphan'));
    expect(movie.deletedAt).toBeNull();
  });

  it('limitで件数を絞る', async () => {
    await seedMovie(database, {uid: 'a', title: 'A'});
    await seedMovie(database, {uid: 'b', title: 'B'});
    stubTmdb({});

    const stats = await deleteOrphanMovies({
      environment,
      throttleMs: 0,
      limit: 1,
    });

    expect(stats.candidates).toBe(1);
    expect(stats.deleted).toBe(1);
  });
});
