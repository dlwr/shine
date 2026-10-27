import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {migrate} from '@shine/database/testing';
import {beforeEach, describe, expect, it} from 'vitest';
import {MoviesService} from '../movies-service';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../../packages/database/migrations',
);

describe('MoviesService.getMovieDetails の公開日', () => {
  let environment: Environment;

  beforeEach(async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-test-'));
    environment = {
      DATABASE_FILE_URL: `file:${path.join(directory, 'test.db')}`,
    };
    const database = getDatabase(environment);
    await migrate(database, {migrationsFolder});
    await database.insert(movies).values([
      {uid: 'movie-dated', year: 1999, releaseDate: '1999-09-15'},
      {uid: 'movie-undated', year: 1999},
    ]);
  });

  it('公開日を返す', async () => {
    const detail = await new MoviesService(environment).getMovieDetails(
      'movie-dated',
    );

    expect(detail.releaseDate).toBe('1999-09-15');
  });

  it('公開日が分からなければ undefined を返す', async () => {
    const detail = await new MoviesService(environment).getMovieDetails(
      'movie-undated',
    );

    expect(detail.releaseDate).toBeUndefined();
  });
});
