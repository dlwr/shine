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
import {migrate} from 'drizzle-orm/libsql/migrator';
import {beforeEach, describe, expect, it} from 'vitest';
import {createJWT} from '../../auth';
import {adminNominationsRoutes} from '../../routes/admin/nominations';
import {AdminCeremoniesService} from '../admin-ceremonies-service';
import {AdminMoviesService} from '../admin-movies-service';
import {NotFoundError} from '../errors';
import {ExternalIdSearchService} from '../external-id-search-service';
import {MovieImportService} from '../movie-import-service';
import {MovieMergeService} from '../movie-merge-service';
import {MovieTmdbService} from '../movie-tmdb-service';
import {MoviesService} from '../movies-service';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../../packages/database/migrations',
);

const JWT_SECRET = 'test-jwt-secret';

let environment: Environment;

beforeEach(async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-test-'));
  environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
    TMDB_API_KEY: 'test-key',
    JWT_SECRET,
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});

  await database.insert(movies).values([
    {uid: 'kept', year: 2020, imdbId: 'tt0000001', tmdbId: 1},
    {
      uid: 'deleted',
      year: 2020,
      imdbId: 'tt0000002',
      tmdbId: 2,
      deletedAt: 1_767_225_600,
    },
  ]);
  await database
    .insert(awardOrganizations)
    .values({uid: 'org', name: 'Org', shortName: 'ORG', country: 'JP'});
  await database
    .insert(awardCategories)
    .values({uid: 'category', organizationUid: 'org', name: 'Best Film'});
  await database
    .insert(awardCeremonies)
    .values({uid: 'ceremony', organizationUid: 'org', year: 2020});
  await database.insert(nominations).values([
    {movieUid: 'kept', ceremonyUid: 'ceremony', categoryUid: 'category'},
    {movieUid: 'deleted', ceremonyUid: 'ceremony', categoryUid: 'category'},
  ]);
});

describe('AdminMoviesService', () => {
  it('一覧に論理削除した映画を含めない', async () => {
    const result = await new AdminMoviesService(environment).getMovies({
      page: 1,
      limit: 10,
    });

    expect(result.movies.map(movie => movie.uid)).toEqual(['kept']);
  });

  it('一覧の総数に論理削除した映画を数えない', async () => {
    const result = await new AdminMoviesService(environment).getMovies({
      page: 1,
      limit: 10,
    });

    expect(result.pagination.totalCount).toBe(1);
  });

  it('論理削除した映画の詳細は NotFound にする', async () => {
    await expect(
      new AdminMoviesService(environment).getMovieForAdmin('deleted'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('論理削除した映画は更新しない', async () => {
    await expect(
      new AdminMoviesService(environment).updateMovie('deleted', {year: 2021}),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('MovieTmdbService', () => {
  it('論理削除した映画の TMDb ID は更新しない', async () => {
    await expect(
      new MovieTmdbService(environment).updateTmdbId('deleted', {tmdbId: 3}),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('論理削除した映画の TMDb ID は自動取得しない', async () => {
    await expect(
      new MovieTmdbService(environment).autoFetchTmdb('deleted'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('論理削除した映画は TMDb から再同期しない', async () => {
    await expect(
      new MovieTmdbService(environment).refreshTmdb('deleted'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('MovieImportService', () => {
  it('論理削除した映画の IMDb ID は更新しない', async () => {
    await expect(
      new MovieImportService(environment).updateIMDbId('deleted', {
        imdbId: 'tt0000003',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('ExternalIdSearchService', () => {
  it('論理削除した映画の外部 ID は検索しない', async () => {
    await expect(
      new ExternalIdSearchService(environment).searchExternalMovieIds(
        'deleted',
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('MovieMergeService', () => {
  it('論理削除した映画をマージ元にしない', async () => {
    await expect(
      new MovieMergeService(environment).mergeMovies({
        sourceMovieId: 'deleted',
        targetMovieId: 'kept',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('論理削除した映画をマージ先にしない', async () => {
    await expect(
      new MovieMergeService(environment).mergeMovies({
        sourceMovieId: 'kept',
        targetMovieId: 'deleted',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('MoviesService', () => {
  it('論理削除した映画に翻訳を足さない', async () => {
    await expect(
      new MoviesService(environment).addMovieTranslation(
        'deleted',
        'ja',
        '題名',
      ),
    ).rejects.toThrow('Movie not found');
  });
});

describe('AdminCeremoniesService', () => {
  it('授賞式一覧の映画数に論理削除した映画を数えない', async () => {
    const [ceremony] = await new AdminCeremoniesService(
      environment,
    ).listCeremonies();

    expect(ceremony.movieCount).toBe(1);
  });

  it('授賞式詳細のノミネートに論理削除した映画を含めない', async () => {
    const detail = await new AdminCeremoniesService(
      environment,
    ).getCeremonyDetail('ceremony');

    expect(detail.nominations.map(nomination => nomination.movie.uid)).toEqual([
      'kept',
    ]);
  });
});

describe('POST /movies/:movieId/nominations', () => {
  it('論理削除した映画にはノミネートを足さない', async () => {
    const response = await adminNominationsRoutes.request(
      '/movies/deleted/nominations',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${await createJWT(JWT_SECRET)}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ceremonyUid: 'ceremony',
          categoryUid: 'category',
        }),
      },
      environment,
    );

    expect(response.status).toBe(404);
  });
});
