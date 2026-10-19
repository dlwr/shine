import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
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
    {uid: 'movie-ja-description', year: 2020},
    {uid: 'movie-ja-title', year: 2021},
    {uid: 'movie-two-nominations', year: 2022},
    {uid: 'movie-one-nomination', year: 2023},
  ]);

  await database.insert(translations).values([
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
      resourceUid: 'movie-ja-title',
      languageCode: 'ja',
      content: '邦題',
    },
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-two-nominations',
      languageCode: 'en',
      content: 'Two Nominations',
      isDefault: 1,
    },
    {
      resourceType: 'movie_description',
      resourceUid: 'movie-two-nominations',
      languageCode: 'en',
      content: 'English synopsis',
    },
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-one-nomination',
      languageCode: 'ja',
      content: '一度だけノミネート',
    },
  ]);

  await database
    .insert(awardOrganizations)
    .values({uid: 'org-academy', name: 'Academy Awards'});
  await database.insert(awardCategories).values([
    {
      uid: 'cat-picture',
      organizationUid: 'org-academy',
      name: 'Academy Award for Best Picture',
    },
    {
      uid: 'cat-director',
      organizationUid: 'org-academy',
      name: 'Academy Award for Best Director',
    },
  ]);
  await database.insert(awardCeremonies).values({
    uid: 'ceremony-2023',
    organizationUid: 'org-academy',
    year: 2023,
    ceremonyNumber: 95,
  });
  await database.insert(nominations).values([
    {
      movieUid: 'movie-two-nominations',
      ceremonyUid: 'ceremony-2023',
      categoryUid: 'cat-picture',
      isWinner: 0,
    },
    {
      movieUid: 'movie-two-nominations',
      ceremonyUid: 'ceremony-2023',
      categoryUid: 'cat-director',
      isWinner: 1,
    },
    {
      movieUid: 'movie-one-nomination',
      ceremonyUid: 'ceremony-2023',
      categoryUid: 'cat-picture',
      isWinner: 0,
    },
  ]);

  return environment;
}

describe('検索エンジンに載せる映画', () => {
  let service: MoviesService;

  beforeEach(async () => {
    service = new MoviesService(await createTestEnvironment());
  });

  it('日本語のあらすじがあれば載せる', async () => {
    const details = await service.getMovieDetails('movie-ja-description', 'ja');

    expect(details.worthIndexing).toBe(true);
  });

  it('ノミネートが 2 件以上あれば日本語が無くても載せる', async () => {
    const details = await service.getMovieDetails(
      'movie-two-nominations',
      'ja',
    );

    expect(details.worthIndexing).toBe(true);
  });

  it('邦題だけでは載せない', async () => {
    const details = await service.getMovieDetails('movie-ja-title', 'ja');

    expect(details.worthIndexing).toBe(false);
  });

  it('ノミネートが 1 件だけでは載せない', async () => {
    const details = await service.getMovieDetails('movie-one-nomination', 'ja');

    expect(details.worthIndexing).toBe(false);
  });

  it('locale が en でも同じ条件で決める', async () => {
    const details = await service.getMovieDetails('movie-ja-title', 'en');

    expect(details.worthIndexing).toBe(false);
  });

  it('uid 一覧には載せる映画だけを入れる', async () => {
    expect(await service.listMovieUids()).toEqual([
      'movie-ja-description',
      'movie-two-nominations',
    ]);
  });
});
