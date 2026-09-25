import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {eq, getDatabase, type Environment} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {migrate} from '@shine/database/testing';
import {beforeEach, describe, expect, it} from 'vitest';
import {getMovieCacheKeysForAllLocales} from '../../utils/cache';
import {AdminMoviesService} from '../admin-movies-service';
import {NotFoundError, ValidationError} from '../errors';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../../packages/database/migrations',
);

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

describe('AdminMoviesService.updateMovie', () => {
  let environment: Environment;
  let database: ReturnType<typeof getDatabase>;
  let service: AdminMoviesService;
  let kvStore: Map<string, string>;

  beforeEach(async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-test-'));
    kvStore = new Map();
    environment = {
      DATABASE_FILE_URL: `file:${path.join(directory, 'test.db')}`,
      CACHE_KV: createKvStub(kvStore),
    } as Environment;
    database = getDatabase(environment);
    await migrate(database, {migrationsFolder});
    service = new AdminMoviesService(environment);
    await database
      .insert(movies)
      .values({uid: 'movie-a', year: 2020, originalLanguage: 'ja'});
  });

  async function movieRow() {
    const [row] = await database
      .select()
      .from(movies)
      .where(eq(movies.uid, 'movie-a'));
    return row;
  }

  it('throws NotFoundError for an unknown movie', async () => {
    await expect(service.updateMovie('missing', {year: 2021})).rejects.toThrow(
      new NotFoundError('Movie not found'),
    );
  });

  it('throws ValidationError when year is out of range', async () => {
    await expect(service.updateMovie('movie-a', {year: 1800})).rejects.toThrow(
      new ValidationError('Year must be a valid integer between 1888 and 2100'),
    );
  });

  it('throws ValidationError when year is not an integer', async () => {
    await expect(
      service.updateMovie('movie-a', {year: '2020'}),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws ValidationError when originalLanguage is not a string', async () => {
    await expect(
      service.updateMovie('movie-a', {originalLanguage: 12}),
    ).rejects.toThrow(
      new ValidationError('Original language must be a string'),
    );
  });

  it('throws ValidationError when originalLanguage is not 2 letters', async () => {
    await expect(
      service.updateMovie('movie-a', {originalLanguage: 'jpn'}),
    ).rejects.toThrow(
      new ValidationError(
        'Original language must be a 2-letter ISO 639-1 code',
      ),
    );
  });

  it('throws ValidationError when mediaType is unknown', async () => {
    await expect(
      service.updateMovie('movie-a', {mediaType: 'short'}),
    ).rejects.toThrow(new ValidationError("mediaType must be 'movie' or 'tv'"));
  });

  it('updates year', async () => {
    await service.updateMovie('movie-a', {year: 2021});

    const row = await movieRow();
    expect(row.year).toBe(2021);
  });

  it('updates originalLanguage', async () => {
    await service.updateMovie('movie-a', {originalLanguage: 'fr'});

    const row = await movieRow();
    expect(row.originalLanguage).toBe('fr');
  });

  it('resets originalLanguage to en when given an empty value', async () => {
    await service.updateMovie('movie-a', {originalLanguage: ''});

    const row = await movieRow();
    expect(row.originalLanguage).toBe('en');
  });

  it('updates mediaType', async () => {
    await service.updateMovie('movie-a', {mediaType: 'tv'});

    const row = await movieRow();
    expect(row.mediaType).toBe('tv');
  });

  it('invalidates the movie detail cache after an update', async () => {
    for (const key of getMovieCacheKeysForAllLocales('movie-a')) {
      kvStore.set(key, JSON.stringify({data: {}, cachedAt: 0}));
    }

    await service.updateMovie('movie-a', {year: 2021});

    expect(kvStore.size).toBe(0);
  });

  it('leaves the cache untouched when nothing is updated', async () => {
    for (const key of getMovieCacheKeysForAllLocales('movie-a')) {
      kvStore.set(key, JSON.stringify({data: {}, cachedAt: 0}));
    }

    await service.updateMovie('movie-a', {});

    expect(kvStore.size).toBe(2);
  });
});
