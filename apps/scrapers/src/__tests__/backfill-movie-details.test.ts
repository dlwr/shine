import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {eq} from 'drizzle-orm';
import {migrate} from '@shine/database/testing';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {getScrapeDatabase} from '../common/dry-run';
import {backfillMovieDetails} from '../backfill-movie-details';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

vi.stubGlobal('fetch', vi.fn());

function stubTmdbDetails(details: {release_date?: string; runtime?: number}) {
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    text: async () =>
      JSON.stringify({
        id: 758_866,
        title: 'ドライブ・マイ・カー',
        original_title: 'ドライブ・マイ・カー',
        ...details,
      }),
  } as unknown as Response);
}

let temporaryDirectories: string[] = [];

async function createTestDatabase(
  values: Partial<typeof movies.$inferInsert> = {},
) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-details-'));
  temporaryDirectories.push(directory);
  const environment: Environment = {
    DATABASE_FILE_URL: `file:${path.join(directory, 'test.db')}`,
    TMDB_API_KEY: 'test-key',
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});
  const [movie] = await database
    .insert(movies)
    .values({year: 2021, tmdbId: 758_866, ...values})
    .returning();
  return {database, environment, movieUid: movie.uid};
}

async function movieOf(
  database: ReturnType<typeof getDatabase>,
  movieUid: string,
) {
  const [movie] = await database
    .select()
    .from(movies)
    .where(eq(movies.uid, movieUid));
  return movie;
}

beforeEach(() => {
  vi.mocked(fetch).mockClear();
});

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.map(async directory =>
      fs.rm(directory, {recursive: true, force: true}),
    ),
  );
  temporaryDirectories = [];
});

describe('backfillMovieDetails', () => {
  it('公開日が無ければ TMDb の公開日で埋める', async () => {
    const {database, environment, movieUid} = await createTestDatabase();
    stubTmdbDetails({release_date: '2021-08-20', runtime: 179});

    await backfillMovieDetails({database, environment, isDryRun: false});

    const movie = await movieOf(database, movieUid);
    expect(movie.releaseDate).toBe('2021-08-20');
  });

  it('上映時間が無ければ TMDb の上映時間で埋める', async () => {
    const {database, environment, movieUid} = await createTestDatabase();
    stubTmdbDetails({release_date: '2021-08-20', runtime: 179});

    await backfillMovieDetails({database, environment, isDryRun: false});

    const movie = await movieOf(database, movieUid);
    expect(movie.runtime).toBe(179);
  });

  it('既にある公開日は上書きしない', async () => {
    const {database, environment, movieUid} = await createTestDatabase({
      releaseDate: '2021-07-11',
    });
    stubTmdbDetails({release_date: '2021-08-20', runtime: 179});

    await backfillMovieDetails({database, environment, isDryRun: false});

    const movie = await movieOf(database, movieUid);
    expect(movie.releaseDate).toBe('2021-07-11');
  });

  it('TMDb の上映時間が 0 なら不明として埋めない', async () => {
    const {database, environment, movieUid} = await createTestDatabase();
    stubTmdbDetails({release_date: '2021-08-20', runtime: 0});

    await backfillMovieDetails({database, environment, isDryRun: false});

    const movie = await movieOf(database, movieUid);
    expect(movie.runtime).toBeNull();
  });

  it('TMDb の公開日が空なら埋めない', async () => {
    const {database, environment, movieUid} = await createTestDatabase();
    stubTmdbDetails({release_date: '', runtime: 179});

    await backfillMovieDetails({database, environment, isDryRun: false});

    const movie = await movieOf(database, movieUid);
    expect(movie.releaseDate).toBeNull();
  });

  it('両方そろっている映画は問い合わせない', async () => {
    const {database, environment} = await createTestDatabase({
      releaseDate: '2021-08-20',
      runtime: 179,
    });

    await backfillMovieDetails({database, environment, isDryRun: false});

    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('TV は問い合わせない', async () => {
    const {database, environment} = await createTestDatabase({
      mediaType: 'tv',
    });

    await backfillMovieDetails({database, environment, isDryRun: false});

    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('soft-delete された映画は対象にしない', async () => {
    const {database, environment} = await createTestDatabase({
      deletedAt: 1_700_000_000,
    });

    await backfillMovieDetails({database, environment, isDryRun: false});

    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('dry-run では書き換えない', async () => {
    const {database, environment, movieUid} = await createTestDatabase();
    stubTmdbDetails({release_date: '2021-08-20', runtime: 179});

    await backfillMovieDetails({
      database: getScrapeDatabase({environment, isDryRun: true}),
      environment,
      isDryRun: true,
    });

    const movie = await movieOf(database, movieUid);
    expect(movie.runtime).toBeNull();
  });

  it('埋めた映画の数を返す', async () => {
    const {database, environment} = await createTestDatabase();
    stubTmdbDetails({release_date: '2021-08-20', runtime: 179});

    const result = await backfillMovieDetails({
      database,
      environment,
      isDryRun: false,
    });

    expect(result.updated).toBe(1);
  });

  it('TMDb に埋める値が無かった映画の数を返す', async () => {
    const {database, environment} = await createTestDatabase();
    stubTmdbDetails({release_date: '', runtime: 0});

    const result = await backfillMovieDetails({
      database,
      environment,
      isDryRun: false,
    });

    expect(result.missing).toBe(1);
  });
});
