import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {AdminService} from '../admin-service';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../../packages/database/migrations',
);

function stubTmdb(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/find/tt0061549')) {
        return Response.json({
          movie_results: [{id: 42_699, media_type: 'movie'}],
          tv_results: [],
        });
      }

      if (url.includes('/movie/42699')) {
        return Response.json({
          id: 42_699,
          title: 'Yongary, Monster from the Deep',
          original_title: '대괴수 용가리',
          original_language: 'ko',
          release_date: '1967-08-13',
          translations: {translations: []},
        });
      }

      return new Response('not found', {status: 404});
    }),
  );
}

describe('AdminService.createMovieFromImdbId', () => {
  let environment: Environment;
  let database: ReturnType<typeof getDatabase>;

  beforeEach(async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-test-'));
    environment = {
      TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
      TURSO_AUTH_TOKEN: '',
      TMDB_API_KEY: 'test-key',
    };
    database = getDatabase(environment);
    await migrate(database, {migrationsFolder});
    stubTmdb();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('同じ TMDb ID を tv の作品が使っていても映画を作成できる', async () => {
    await database
      .insert(movies)
      .values({uid: 'dekalog', tmdbId: 42_699, mediaType: 'tv', year: 1989});

    const service = new AdminService(environment);
    const result = await service.createMovieFromImdbId('tt0061549');

    expect(result.movie.tmdbId).toBe(42_699);
    expect(result.movie.mediaType).toBe('movie');
  });

  it('同じ TMDb ID の映画が既にあれば作成しない', async () => {
    await database
      .insert(movies)
      .values({uid: 'yongary', tmdbId: 42_699, mediaType: 'movie'});

    const service = new AdminService(environment);

    await expect(service.createMovieFromImdbId('tt0061549')).rejects.toThrow(
      'TMDB ID is already used by another movie',
    );
  });
});
