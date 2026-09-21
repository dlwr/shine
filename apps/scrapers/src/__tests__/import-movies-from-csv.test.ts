import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {eq} from 'drizzle-orm';
import {getDatabase, type Environment} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {importMoviesFromCsv} from '../import-imdb-list';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

const CSV_HEADER = 'Const,Title,Original Title,Year,Release Date,Description';

type Route = {status: number; body?: unknown};

let temporaryDirectories: string[] = [];

function stubTmdb(routes: Record<string, Route>) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = new URL(input);
      if (url.pathname !== '/3/configuration') {
        calls.push(url.pathname);
      }

      const route = routes[url.pathname] ?? ({status: 404} as Route);
      return {
        ok: route.status >= 200 && route.status < 300,
        status: route.status,
        statusText: String(route.status),
        headers: new Headers(),
        async json() {
          return route.body;
        },
        async text() {
          return JSON.stringify(route.body ?? {});
        },
      };
    }),
  );
  return calls;
}

const CONFIGURATION_ROUTE = {
  '/3/configuration': {
    status: 200,
    body: {
      images: {
        secure_base_url: 'https://image.tmdb.org/t/p/',
        poster_sizes: ['w500', 'original'],
      },
    },
  },
};

async function createTestRun(csvRows: string[]) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-csv-'));
  temporaryDirectories.push(directory);
  const environment: Environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
    TMDB_API_KEY: 'test-key',
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});
  const filePath = path.join(directory, 'list.csv');
  await fs.writeFile(filePath, [CSV_HEADER, ...csvRows].join('\n'));
  return {database, environment, filePath};
}

async function runWithExistingMovie() {
  const run = await createTestRun(['tt0000001,既存の映画,Existing,1990,,']);
  const [movie] = await run.database
    .insert(movies)
    .values({imdbId: 'tt0000001', tmdbId: 1, year: 1990})
    .returning();
  const calls = stubTmdb(CONFIGURATION_ROUTE);
  const stats = await importMoviesFromCsv({
    filePath: run.filePath,
    environment: run.environment,
    throttleMs: 0,
  });
  return {...run, movie, calls, stats};
}

async function runWithNewMovie(shouldDryRun = false) {
  const run = await createTestRun(['tt0000002,新しい映画,New Movie,2001,,']);
  stubTmdb({
    ...CONFIGURATION_ROUTE,
    '/3/find/tt0000002': {
      status: 200,
      body: {movie_results: [{id: 278}], tv_results: []},
    },
    '/3/movie/278': {
      status: 200,
      body: {
        id: 278,
        title: 'New Movie',
        original_title: 'New Movie',
        original_language: 'en',
        release_date: '2001-05-01',
      },
    },
  });
  const stats = await importMoviesFromCsv({
    filePath: run.filePath,
    environment: run.environment,
    throttleMs: 0,
    dryRun: shouldDryRun,
  });
  return {...run, stats};
}

async function runWithSoftDeletedMovie() {
  const run = await createTestRun(['tt0000003,消した映画,Deleted,1985,,']);
  await run.database.insert(movies).values({
    imdbId: 'tt0000003',
    tmdbId: 3,
    year: 1985,
    deletedAt: Math.floor(Date.now() / 1000),
  });
  const calls = stubTmdb(CONFIGURATION_ROUTE);
  const stats = await importMoviesFromCsv({
    filePath: run.filePath,
    environment: run.environment,
    throttleMs: 0,
  });
  return {...run, calls, stats};
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await Promise.all(
    temporaryDirectories.map(async directory =>
      fs.rm(directory, {recursive: true, force: true}),
    ),
  );
  temporaryDirectories = [];
});

describe('importMoviesFromCsv: 登録済みの映画', () => {
  it('映画を作り直さない', async () => {
    const {database} = await runWithExistingMovie();

    const rows = await database.select({uid: movies.uid}).from(movies);

    expect(rows).toHaveLength(1);
  });

  it('その映画にノミネートを付ける', async () => {
    const {database, movie} = await runWithExistingMovie();

    const rows = await database
      .select({uid: nominations.uid})
      .from(nominations)
      .where(eq(nominations.movieUid, movie.uid));

    expect(rows).toHaveLength(1);
  });

  it('TMDb に映画を問い合わせない', async () => {
    const {calls} = await runWithExistingMovie();

    expect(calls).toEqual([]);
  });
});

describe('importMoviesFromCsv: 未登録の映画', () => {
  it('IMDb ID と TMDb ID を持つ映画を作る', async () => {
    const {database} = await runWithNewMovie();

    const rows = await database
      .select({imdbId: movies.imdbId, tmdbId: movies.tmdbId})
      .from(movies);

    expect(rows).toEqual([{imdbId: 'tt0000002', tmdbId: 278}]);
  });

  it('作った映画にノミネートを付ける', async () => {
    const {database} = await runWithNewMovie();

    const rows = await database
      .select({uid: nominations.uid})
      .from(nominations);

    expect(rows).toHaveLength(1);
  });

  it('dry-run では映画を作らない', async () => {
    const {database} = await runWithNewMovie(true);

    const rows = await database.select({uid: movies.uid}).from(movies);

    expect(rows).toHaveLength(0);
  });
});

describe('importMoviesFromCsv: 論理削除済みの映画', () => {
  it('映画を作り直さない', async () => {
    const {database} = await runWithSoftDeletedMovie();

    const rows = await database.select({uid: movies.uid}).from(movies);

    expect(rows).toHaveLength(1);
  });

  it('ノミネートを付けない', async () => {
    const {database} = await runWithSoftDeletedMovie();

    const rows = await database
      .select({uid: nominations.uid})
      .from(nominations);

    expect(rows).toHaveLength(0);
  });

  it('TMDb に映画を問い合わせない', async () => {
    const {calls} = await runWithSoftDeletedMovie();

    expect(calls).toEqual([]);
  });

  it('失敗として数えない', async () => {
    const {stats} = await runWithSoftDeletedMovie();

    expect(stats.failed).toBe(0);
  });
});
