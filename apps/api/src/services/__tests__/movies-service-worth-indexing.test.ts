import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {translations} from '@shine/database/schema/translations';
import {migrate} from '@shine/database/testing';
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
    DATABASE_FILE_URL: `file:${path.join(directory, 'test.db')}`,
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});

  await database.insert(movies).values([
    {uid: 'movie-ja-title', year: 2020},
    {uid: 'movie-ja-description', year: 2021},
    {uid: 'movie-thin', year: 2022},
  ]);

  await database.insert(translations).values([
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-ja-title',
      languageCode: 'ja',
      content: '邦題',
    },
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-ja-description',
      languageCode: 'en',
      content: 'English Title',
      isDefault: 1,
    },
    {
      resourceType: 'movie_description',
      resourceUid: 'movie-ja-description',
      languageCode: 'ja',
      content: '日本語のあらすじ',
    },
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-thin',
      languageCode: 'en',
      content: 'Thin',
      isDefault: 1,
    },
    {
      resourceType: 'movie_description',
      resourceUid: 'movie-thin',
      languageCode: 'en',
      content: 'English synopsis',
    },
  ]);

  return environment;
}

describe('検索エンジンに載せる映画', () => {
  let service: MoviesService;

  beforeEach(async () => {
    service = new MoviesService(await createTestEnvironment());
  });

  it('邦題があれば載せる', async () => {
    const details = await service.getMovieDetails('movie-ja-title', 'ja');

    expect(details.worthIndexing).toBe(true);
  });

  it('日本語のあらすじがあれば載せる', async () => {
    const details = await service.getMovieDetails('movie-ja-description', 'ja');

    expect(details.worthIndexing).toBe(true);
  });

  it('邦題も日本語のあらすじも無ければ載せない', async () => {
    const details = await service.getMovieDetails('movie-thin', 'ja');

    expect(details.worthIndexing).toBe(false);
  });

  it('locale が en でも日本語の有無で決める', async () => {
    const details = await service.getMovieDetails('movie-thin', 'en');

    expect(details.worthIndexing).toBe(false);
  });

  it('uid 一覧には載せる映画だけを入れる', async () => {
    expect(await service.listMovieUids()).toEqual([
      'movie-ja-title',
      'movie-ja-description',
    ]);
  });
});
