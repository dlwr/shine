import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {and, eq} from 'drizzle-orm';
import {getDatabase, type Environment} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {translations} from '@shine/database/schema/translations';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  fixMisattributedNominations,
  type MisattributedNomination,
} from '../fix-misattributed-nominations';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

type TestDatabase = ReturnType<typeof getDatabase>;

async function createTestEnvironment(): Promise<{
  environment: Environment;
  database: TestDatabase;
}> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-misattr-'));
  const environment: Environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
    TMDB_API_KEY: 'test-key',
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});
  await database
    .insert(awardOrganizations)
    .values({uid: 'org', name: 'Kinema Junpo'});
  await database
    .insert(awardCategories)
    .values({uid: 'cat', organizationUid: 'org', name: 'Best Japanese Film'});
  await database
    .insert(awardCeremonies)
    .values({uid: 'ceremony', organizationUid: 'org', year: 1959});
  return {environment, database};
}

async function seedMovie(
  database: TestDatabase,
  values: {
    uid: string;
    title: string;
    year: number;
    imdbId?: string;
    deleted?: boolean;
  },
): Promise<void> {
  await database.insert(movies).values({
    uid: values.uid,
    year: values.year,
    imdbId: values.imdbId,
    deletedAt: values.deleted ? Math.floor(Date.now() / 1000) : undefined,
  });
  await database.insert(translations).values({
    resourceType: 'movie_title',
    resourceUid: values.uid,
    languageCode: 'ja',
    content: values.title,
    isDefault: 1,
  });
}

const entry: MisattributedNomination = {
  organization: 'Kinema Junpo',
  category: 'Best Japanese Film',
  ceremonyYear: 1959,
  specialMention: '2位',
  wrongImdbId: 'tt3893038',
  correctImdbId: 'tt0053121',
  correctTitle: '野火',
  correctYear: 1959,
};

describe('fixMisattributedNominations', () => {
  let environment: Environment;
  let database: TestDatabase;

  beforeEach(async () => {
    ({environment, database} = await createTestEnvironment());
    await seedMovie(database, {
      uid: 'wrong-movie',
      title: '野火',
      year: 2015,
      imdbId: 'tt3893038',
    });
    await database.insert(nominations).values({
      uid: 'nomination',
      movieUid: 'wrong-movie',
      ceremonyUid: 'ceremony',
      categoryUid: 'cat',
      isWinner: 0,
      specialMention: '2位',
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('ノミネーションを正しい映画に付け替える', async () => {
    await seedMovie(database, {
      uid: 'correct-movie',
      title: '野火',
      year: 1959,
      imdbId: 'tt0053121',
    });

    await fixMisattributedNominations({environment, entries: [entry]});

    const [row] = await database
      .select()
      .from(nominations)
      .where(eq(nominations.uid, 'nomination'));
    expect(row.movieUid).toBe('correct-movie');
  });

  it('付け替えても順位は保持される', async () => {
    await seedMovie(database, {
      uid: 'correct-movie',
      title: '野火',
      year: 1959,
      imdbId: 'tt0053121',
    });

    await fixMisattributedNominations({environment, entries: [entry]});

    const [row] = await database
      .select()
      .from(nominations)
      .where(eq(nominations.uid, 'nomination'));
    expect(row.specialMention).toBe('2位');
  });

  it('ソフト削除された正しい映画を復活させて使う', async () => {
    await seedMovie(database, {
      uid: 'correct-movie',
      title: '野火',
      year: 1959,
      imdbId: 'tt0053121',
      deleted: true,
    });

    await fixMisattributedNominations({environment, entries: [entry]});

    const [movie] = await database
      .select()
      .from(movies)
      .where(eq(movies.uid, 'correct-movie'));
    expect(movie.deletedAt).toBeNull();
  });

  it('移動先が同じ賞のノミネーションを既に持つ場合は元の行を削除する', async () => {
    await seedMovie(database, {
      uid: 'correct-movie',
      title: '野火',
      year: 1959,
      imdbId: 'tt0053121',
    });
    await database.insert(nominations).values({
      uid: 'existing',
      movieUid: 'correct-movie',
      ceremonyUid: 'ceremony',
      categoryUid: 'cat',
      isWinner: 0,
      specialMention: '2位',
    });

    await fixMisattributedNominations({environment, entries: [entry]});

    const rows = await database
      .select()
      .from(nominations)
      .where(eq(nominations.uid, 'nomination'));
    expect(rows).toHaveLength(0);
  });

  it('対象のノミネーションが無ければ何もしない', async () => {
    await seedMovie(database, {
      uid: 'correct-movie',
      title: '野火',
      year: 1959,
      imdbId: 'tt0053121',
    });

    await fixMisattributedNominations({environment, entries: [entry]});
    const stats = await fixMisattributedNominations({
      environment,
      entries: [entry],
    });

    expect(stats.skipped).toBe(1);
    expect(stats.repointed).toBe(0);
  });

  it('dry-runでは付け替えない', async () => {
    await seedMovie(database, {
      uid: 'correct-movie',
      title: '野火',
      year: 1959,
      imdbId: 'tt0053121',
    });

    await fixMisattributedNominations({
      environment,
      entries: [entry],
      dryRun: true,
    });

    const [row] = await database
      .select()
      .from(nominations)
      .where(eq(nominations.uid, 'nomination'));
    expect(row.movieUid).toBe('wrong-movie');
  });

  it('正しい映画がDBに無ければTMDbから作成する', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.includes('/find/tt0053121')) {
          return Response.json(
            {movie_results: [{id: 42, media_type: 'movie'}]},
            {status: 200},
          );
        }

        if (url.includes('/movie/42')) {
          return Response.json(
            {
              id: 42,
              title: 'Fires on the Plain',
              original_language: 'ja',
              release_date: '1959-11-03',
            },
            {status: 200},
          );
        }

        return new Response('{}', {status: 404});
      }),
    );

    const stats = await fixMisattributedNominations({
      environment,
      entries: [entry],
    });

    const [created] = await database
      .select()
      .from(movies)
      .where(eq(movies.imdbId, 'tt0053121'));
    expect(created.year).toBe(1959);
    expect(stats.moviesCreated).toBe(1);
  });

  it('作成した日本語映画は日本語タイトルがデフォルトになる', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.includes('/find/tt0053121')) {
          return Response.json(
            {movie_results: [{id: 42, media_type: 'movie'}]},
            {status: 200},
          );
        }

        if (url.includes('/movie/42')) {
          return Response.json(
            {
              id: 42,
              title: 'Fires on the Plain',
              original_language: 'ja',
              release_date: '1959-11-03',
            },
            {status: 200},
          );
        }

        return new Response('{}', {status: 404});
      }),
    );

    await fixMisattributedNominations({
      environment,
      entries: [entry],
    });

    const [created] = await database
      .select()
      .from(movies)
      .where(eq(movies.imdbId, 'tt0053121'));
    const titleRows = await database
      .select()
      .from(translations)
      .where(
        and(
          eq(translations.resourceUid, created.uid),
          eq(translations.resourceType, 'movie_title'),
        ),
      );
    const byLanguage = new Map(titleRows.map(row => [row.languageCode, row]));
    expect(byLanguage.get('ja')?.isDefault).toBe(1);
    expect(byLanguage.get('en')?.isDefault).toBe(0);
  });

  it('IMDb IDが無い映画はタイトルと年だけで作成する', async () => {
    const entryWithoutImdbId: MisattributedNomination = {
      ...entry,
      correctImdbId: undefined,
      correctTitle: '兄いもうと',
      correctYear: 1936,
    };

    await fixMisattributedNominations({
      environment,
      entries: [entryWithoutImdbId],
    });

    const [row] = await database
      .select()
      .from(nominations)
      .where(eq(nominations.uid, 'nomination'));
    const [title] = await database
      .select()
      .from(translations)
      .where(
        and(
          eq(translations.resourceUid, row.movieUid),
          eq(translations.languageCode, 'ja'),
        ),
      );
    expect(title.content).toBe('兄いもうと');
  });

  it('付け替えた映画のUIDを両方返す', async () => {
    await seedMovie(database, {
      uid: 'correct-movie',
      title: '野火',
      year: 1959,
      imdbId: 'tt0053121',
    });

    const stats = await fixMisattributedNominations({
      environment,
      entries: [entry],
    });

    expect(
      stats.affectedMovieUids.toSorted((a, b) => a.localeCompare(b)),
    ).toEqual(['correct-movie', 'wrong-movie']);
  });
});
