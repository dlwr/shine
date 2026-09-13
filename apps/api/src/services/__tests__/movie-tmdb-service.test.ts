import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {eq, getDatabase, type Environment} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {translations} from '@shine/database/schema/translations';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {getMovieCacheKeysForAllLocales} from '../../utils/cache';
import {
  ConflictError,
  NotFoundError,
  TmdbConfigError,
  TmdbDataNotFoundError,
  TmdbSyncError,
  ValidationError,
} from '../errors';
import {MovieTmdbService} from '../movie-tmdb-service';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../../packages/database/migrations',
);

const TMDB_ID = 42_699;

function createKvStub(store: Map<string, string>): KVNamespace {
  return {
    async get(key: string) {
      const value = store.get(key);
      return value === undefined ? undefined : JSON.parse(value);
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
  } as unknown as KVNamespace;
}

type TmdbStubOptions = {
  found?: boolean;
  detailsStatus?: number;
};

function stubTmdb(options: TmdbStubOptions = {}): void {
  const {found = true, detailsStatus = 200} = options;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/find/tt0061549')) {
        return Response.json({
          movie_results: found ? [{id: TMDB_ID, media_type: 'movie'}] : [],
          tv_results: [],
        });
      }

      if (url.includes(`/movie/${TMDB_ID}/images`)) {
        return Response.json({posters: []});
      }

      if (url.includes(`/movie/${TMDB_ID}/translations`)) {
        return Response.json({
          translations: [{iso_639_1: 'en', data: {title: 'Yongary'}}],
        });
      }

      if (url.includes(`/movie/${TMDB_ID}`)) {
        if (detailsStatus !== 200) {
          return new Response('error', {status: detailsStatus});
        }

        return Response.json({
          id: TMDB_ID,
          original_title: '대괴수 용가리',
          original_language: 'ko',
        });
      }

      return new Response('not found', {status: 404});
    }),
  );
}

let environment: Environment;
let database: ReturnType<typeof getDatabase>;
let kvStore: Map<string, string>;

async function setUp(apiKey = 'test-key'): Promise<void> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-test-'));
  kvStore = new Map();
  environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
    TMDB_API_KEY: apiKey,
    CACHE_KV: createKvStub(kvStore),
  } as Environment;
  database = getDatabase(environment);
  await migrate(database, {migrationsFolder});
}

async function movieRow(uid: string) {
  const [row] = await database.select().from(movies).where(eq(movies.uid, uid));
  return row;
}

function seedCache(uid: string): void {
  for (const key of getMovieCacheKeysForAllLocales(uid)) {
    kvStore.set(key, JSON.stringify({data: {}, cachedAt: 0}));
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MovieTmdbService.updateTmdbId', () => {
  beforeEach(async () => {
    await setUp();
    await database.insert(movies).values([
      {uid: 'movie-a', imdbId: 'tt0061549', year: 1967},
      {uid: 'tv-a', tmdbId: TMDB_ID, mediaType: 'tv', year: 1989},
    ]);
    stubTmdb();
  });

  it('throws ValidationError when tmdbId is not a positive integer', async () => {
    const service = new MovieTmdbService(environment);

    await expect(
      service.updateTmdbId('movie-a', {tmdbId: 0}),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      service.updateTmdbId('movie-a', {tmdbId: '42'}),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws NotFoundError for an unknown movie', async () => {
    await expect(
      new MovieTmdbService(environment).updateTmdbId('missing', {tmdbId: 1}),
    ).rejects.toThrow(new NotFoundError('Movie not found'));
  });

  it('throws ConflictError when another movie of the same media type has the id', async () => {
    await database
      .insert(movies)
      .values({uid: 'movie-b', tmdbId: TMDB_ID, mediaType: 'movie'});

    await expect(
      new MovieTmdbService(environment).updateTmdbId('movie-a', {
        tmdbId: TMDB_ID,
      }),
    ).rejects.toThrow(
      new ConflictError('TMDb ID is already used by another movie'),
    );
  });

  it('allows the same id as a tv record when the movie stays a movie', async () => {
    await new MovieTmdbService(environment).updateTmdbId('movie-a', {
      tmdbId: TMDB_ID,
    });

    const row = await movieRow('movie-a');
    expect(row.tmdbId).toBe(TMDB_ID);
    expect(row.mediaType).toBe('movie');
  });

  it('switches mediaType to tv when requested', async () => {
    await new MovieTmdbService(environment).updateTmdbId('movie-a', {
      tmdbId: 1,
      mediaType: 'tv',
    });

    const row = await movieRow('movie-a');
    expect(row.mediaType).toBe('tv');
  });

  it('returns no refreshResults when refreshData is off', async () => {
    const result = await new MovieTmdbService(environment).updateTmdbId(
      'movie-a',
      {tmdbId: TMDB_ID},
    );

    expect(result.refreshResults).toBeUndefined();
  });

  it('syncs titles from TMDb when refreshData is on', async () => {
    const result = await new MovieTmdbService(environment).updateTmdbId(
      'movie-a',
      {tmdbId: TMDB_ID, refreshData: true},
    );

    expect(result.refreshResults).toEqual({
      postersAdded: 0,
      translationsAdded: 1,
    });
    const titles = await database
      .select({content: translations.content})
      .from(translations)
      .where(eq(translations.resourceUid, 'movie-a'));
    expect(titles.map(row => row.content)).toEqual(['Yongary']);
  });

  it('keeps the update when the refresh fails', async () => {
    stubTmdb({detailsStatus: 500});

    const result = await new MovieTmdbService(environment).updateTmdbId(
      'movie-a',
      {tmdbId: TMDB_ID, refreshData: true},
    );

    expect(result.refreshResults).toEqual({
      postersAdded: 0,
      translationsAdded: 0,
    });
    const row = await movieRow('movie-a');
    expect(row.tmdbId).toBe(TMDB_ID);
  });

  it('invalidates the movie detail cache', async () => {
    seedCache('movie-a');

    await new MovieTmdbService(environment).updateTmdbId('movie-a', {
      tmdbId: TMDB_ID,
    });

    expect(kvStore.size).toBe(0);
  });
});

describe('MovieTmdbService.autoFetchTmdb', () => {
  beforeEach(async () => {
    await setUp();
    await database
      .insert(movies)
      .values({uid: 'movie-a', imdbId: 'tt0061549', year: 1967});
    stubTmdb();
  });

  it('throws NotFoundError for an unknown movie', async () => {
    await expect(
      new MovieTmdbService(environment).autoFetchTmdb('missing'),
    ).rejects.toThrow(new NotFoundError('Movie not found'));
  });

  it('throws ValidationError when the movie has no IMDb ID', async () => {
    await database.insert(movies).values({uid: 'movie-b', year: 1967});

    await expect(
      new MovieTmdbService(environment).autoFetchTmdb('movie-b'),
    ).rejects.toThrow(new ValidationError('Movie does not have an IMDb ID'));
  });

  it('throws TmdbConfigError when the API key is missing', async () => {
    await setUp('');
    await database
      .insert(movies)
      .values({uid: 'movie-a', imdbId: 'tt0061549', year: 1967});

    await expect(
      new MovieTmdbService(environment).autoFetchTmdb('movie-a'),
    ).rejects.toBeInstanceOf(TmdbConfigError);
  });

  it('throws TmdbDataNotFoundError when TMDb has no match', async () => {
    stubTmdb({found: false});

    await expect(
      new MovieTmdbService(environment).autoFetchTmdb('movie-a'),
    ).rejects.toThrow(
      new TmdbDataNotFoundError('TMDb映画が見つかりませんでした'),
    );
  });

  it('throws ConflictError when the found id belongs to another movie', async () => {
    await database
      .insert(movies)
      .values({uid: 'movie-b', tmdbId: TMDB_ID, mediaType: 'movie'});

    await expect(
      new MovieTmdbService(environment).autoFetchTmdb('movie-a'),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('sets the found id and syncs titles', async () => {
    const result = await new MovieTmdbService(environment).autoFetchTmdb(
      'movie-a',
    );

    expect(result).toEqual({
      tmdbIdSet: true,
      postersAdded: 0,
      translationsAdded: 1,
    });
    const row = await movieRow('movie-a');
    expect(row.tmdbId).toBe(TMDB_ID);
    expect(row.originalLanguage).toBe('ko');
  });

  it('only syncs when the movie already has a TMDb ID', async () => {
    await database
      .update(movies)
      .set({tmdbId: TMDB_ID})
      .where(eq(movies.uid, 'movie-a'));

    const result = await new MovieTmdbService(environment).autoFetchTmdb(
      'movie-a',
    );

    expect(result.tmdbIdSet).toBe(false);
    expect(result.translationsAdded).toBe(1);
  });

  it('wraps sync failures in TmdbSyncError with the cause', async () => {
    stubTmdb({detailsStatus: 500});

    const promise = new MovieTmdbService(environment).autoFetchTmdb('movie-a');

    await expect(promise).rejects.toBeInstanceOf(TmdbSyncError);
    await expect(promise).rejects.toMatchObject({
      message: 'TMDbデータの自動取得に失敗しました',
      cause: expect.objectContaining({
        message: 'TMDb movie details request failed: 500',
      }),
    });
  });

  it('invalidates the movie detail cache', async () => {
    seedCache('movie-a');

    await new MovieTmdbService(environment).autoFetchTmdb('movie-a');

    expect(kvStore.size).toBe(0);
  });
});

describe('MovieTmdbService.refreshTmdb', () => {
  beforeEach(async () => {
    await setUp();
    await database
      .insert(movies)
      .values({uid: 'movie-a', tmdbId: TMDB_ID, year: 1967});
    stubTmdb();
  });

  it('throws NotFoundError for an unknown movie', async () => {
    await expect(
      new MovieTmdbService(environment).refreshTmdb('missing'),
    ).rejects.toThrow(new NotFoundError('Movie not found'));
  });

  it('throws ValidationError when the movie has no TMDb ID', async () => {
    await database.insert(movies).values({uid: 'movie-b', year: 1967});

    await expect(
      new MovieTmdbService(environment).refreshTmdb('movie-b'),
    ).rejects.toThrow(new ValidationError('Movie does not have a TMDb ID'));
  });

  it('throws TmdbConfigError when the API key is missing', async () => {
    await setUp('');
    await database
      .insert(movies)
      .values({uid: 'movie-a', tmdbId: TMDB_ID, year: 1967});

    await expect(
      new MovieTmdbService(environment).refreshTmdb('movie-a'),
    ).rejects.toBeInstanceOf(TmdbConfigError);
  });

  it('returns the sync counts', async () => {
    const result = await new MovieTmdbService(environment).refreshTmdb(
      'movie-a',
    );

    expect(result).toEqual({postersAdded: 0, translationsAdded: 1});
  });

  it('wraps sync failures in TmdbSyncError', async () => {
    stubTmdb({detailsStatus: 500});

    await expect(
      new MovieTmdbService(environment).refreshTmdb('movie-a'),
    ).rejects.toThrow(new TmdbSyncError('Failed to refresh TMDb data'));
  });

  it('invalidates the movie detail cache', async () => {
    seedCache('movie-a');

    await new MovieTmdbService(environment).refreshTmdb('movie-a');

    expect(kvStore.size).toBe(0);
  });
});
