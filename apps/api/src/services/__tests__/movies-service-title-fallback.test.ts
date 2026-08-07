import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {translations} from '@shine/database/schema/translations';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {beforeEach, describe, expect, it} from 'vitest';
import {MoviesService} from '../movies-service';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../../packages/database/migrations',
);

async function createTestEnvironment(): Promise<Environment> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-test-'));
  const environment: Environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});

  await database.insert(movies).values([
    {uid: 'movie-ja', year: 2020},
    {uid: 'movie-en-default', year: 1928},
    {uid: 'movie-fr-only', year: 1960},
  ]);

  await database.insert(translations).values([
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-ja',
      languageCode: 'ja',
      content: '日本語タイトル',
    },
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-ja',
      languageCode: 'en',
      content: 'Japanese Title',
      isDefault: 1,
    },
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-en-default',
      languageCode: 'en',
      content: 'The Racket',
      isDefault: 1,
    },
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-fr-only',
      languageCode: 'fr',
      content: 'À bout de souffle',
    },
  ]);

  return environment;
}

describe('タイトルのフォールバック', () => {
  let environment: Environment;

  beforeEach(async () => {
    environment = await createTestEnvironment();
  });

  describe('getMovieDetails', () => {
    it('locale訳があればそれを返す', async () => {
      const service = new MoviesService(environment);
      const details = await service.getMovieDetails('movie-ja', 'ja');

      expect(details.title).toBe('日本語タイトル');
    });

    it('ja訳が無ければデフォルト翻訳にフォールバックする', async () => {
      const service = new MoviesService(environment);
      const details = await service.getMovieDetails('movie-en-default', 'ja');

      expect(details.title).toBe('The Racket');
    });

    it('デフォルトも無ければ任意の翻訳にフォールバックする', async () => {
      const service = new MoviesService(environment);
      const details = await service.getMovieDetails('movie-fr-only', 'ja');

      expect(details.title).toBe('À bout de souffle');
    });
  });

  describe('searchMovies', () => {
    it('ja訳が無い映画もデフォルト翻訳のタイトルで返す', async () => {
      const service = new MoviesService(environment);
      const result = await service.searchMovies({
        page: 1,
        limit: 10,
        year: 1928,
      });

      expect(result.movies).toHaveLength(1);
      expect(result.movies[0].title).toBe('The Racket');
    });
  });
});
