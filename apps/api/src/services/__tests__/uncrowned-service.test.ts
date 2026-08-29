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
import {posterUrls} from '@shine/database/schema/poster-urls';
import {translations} from '@shine/database/schema/translations';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {beforeEach, describe, expect, it} from 'vitest';
import {UncrownedService} from '../uncrowned-service';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../../packages/database/migrations',
);

type TestDatabase = ReturnType<typeof getDatabase>;

async function createTestEnvironment(): Promise<{
  environment: Environment;
  database: TestDatabase;
}> {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'shine-uncrowned-'),
  );
  const environment: Environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});
  return {environment, database};
}

const AWARDS = [
  {
    orgUid: 'org-cannes',
    orgName: 'Cannes Film Festival',
    categoryUid: 'cat-palme',
    categoryName: "Palme d'Or",
    ceremonyUid: 'ceremony-cannes',
    ceremonyYear: 2019,
  },
  {
    orgUid: 'org-academy',
    orgName: 'Academy Awards',
    categoryUid: 'cat-best-picture',
    categoryName: 'Academy Award for Best Picture',
    ceremonyUid: 'ceremony-academy',
    ceremonyYear: 2020,
  },
  {
    orgUid: 'org-kinejun',
    orgName: 'Kinema Junpo',
    categoryUid: 'cat-kj-foreign',
    categoryName: 'Best Foreign Film',
    ceremonyUid: 'ceremony-kinejun',
    ceremonyYear: 2021,
  },
  {
    orgUid: 'org-1001',
    orgName: '1001 Movies You Must See Before You Die',
    categoryUid: 'cat-1001',
    categoryName: 'Selected Films',
    ceremonyUid: 'ceremony-1001',
    ceremonyYear: 2020,
  },
];

async function seedAwards(database: TestDatabase): Promise<void> {
  for (const award of AWARDS) {
    await database
      .insert(awardOrganizations)
      .values({uid: award.orgUid, name: award.orgName});
    await database.insert(awardCategories).values({
      uid: award.categoryUid,
      organizationUid: award.orgUid,
      name: award.categoryName,
    });
    await database.insert(awardCeremonies).values({
      uid: award.ceremonyUid,
      organizationUid: award.orgUid,
      year: award.ceremonyYear,
    });
  }
}

async function seedMovie(
  database: TestDatabase,
  uid: string,
  options: {
    jaTitle?: string;
    defaultTitle?: string;
    year?: number;
    posterUrl?: string;
    deleted?: boolean;
  } = {},
): Promise<void> {
  await database.insert(movies).values({
    uid,
    year: options.year ?? 2020,
    deletedAt: options.deleted ? 1_700_000_000 : undefined,
  });
  await database.insert(translations).values({
    resourceType: 'movie_title',
    resourceUid: uid,
    languageCode: 'en',
    content: options.defaultTitle ?? `${uid} title`,
    isDefault: 1,
  });
  if (options.jaTitle) {
    await database.insert(translations).values({
      resourceType: 'movie_title',
      resourceUid: uid,
      languageCode: 'ja',
      content: options.jaTitle,
    });
  }

  if (options.posterUrl) {
    await database.insert(posterUrls).values({
      movieUid: uid,
      url: options.posterUrl,
      isPrimary: 1,
    });
  }
}

async function nominate(
  database: TestDatabase,
  movieUid: string,
  entries: Array<{award: number; isWinner?: boolean}>,
): Promise<void> {
  await database.insert(nominations).values(
    entries.map(entry => ({
      movieUid,
      ceremonyUid: AWARDS[entry.award].ceremonyUid,
      categoryUid: AWARDS[entry.award].categoryUid,
      isWinner: entry.isWinner ? 1 : 0,
    })),
  );
}

describe('UncrownedService.getUncrowned', () => {
  let service: UncrownedService;
  let database: TestDatabase;

  beforeEach(async () => {
    const created = await createTestEnvironment();
    database = created.database;
    service = new UncrownedService(created.environment);
    await seedAwards(database);
    await seedMovie(database, 'movie-3losses', {
      jaTitle: '三連敗の映画',
      year: 2018,
      posterUrl: 'https://example.com/3losses.jpg',
    });
    await seedMovie(database, 'movie-2losses', {
      defaultTitle: 'Two Losses',
      year: 2019,
    });
    await seedMovie(database, 'movie-1loss', {
      defaultTitle: 'One Loss',
      year: 2020,
    });
    await seedMovie(database, 'movie-winner', {defaultTitle: 'The Winner'});
    await nominate(database, 'movie-3losses', [
      {award: 0},
      {award: 1},
      {award: 2},
    ]);
    await nominate(database, 'movie-2losses', [{award: 0}, {award: 1}]);
    await nominate(database, 'movie-1loss', [{award: 0}]);
    await nominate(database, 'movie-winner', [
      {award: 0},
      {award: 1, isWinner: true},
      {award: 2},
    ]);
  });

  it('一度も勝っていない映画を敗北数の多い順に返す', async () => {
    const {topMovies} = await service.getUncrowned();

    expect(topMovies.map(movie => movie.uid)).toEqual([
      'movie-3losses',
      'movie-2losses',
      'movie-1loss',
    ]);
  });

  it('勝ったことのある映画は含めない', async () => {
    const {topMovies} = await service.getUncrowned();

    expect(topMovies.map(movie => movie.uid)).not.toContain('movie-winner');
  });

  it('敗北した賞のslugとセレモニーの年を返す', async () => {
    const {topMovies} = await service.getUncrowned();

    expect(topMovies[0].losses).toEqual([
      {slug: 'palme-dor', year: 2019},
      {slug: 'academy-best-picture', year: 2020},
      {slug: 'kinema-junpo-foreign', year: 2021},
    ]);
  });

  it('リスト型の賞への選出は敗北に数えない', async () => {
    await nominate(database, 'movie-1loss', [{award: 3}]);

    const {topMovies} = await service.getUncrowned();

    expect(
      topMovies.find(movie => movie.uid === 'movie-1loss')?.losses,
    ).toEqual([{slug: 'palme-dor', year: 2019}]);
  });

  it('リスト型の賞で選ばれていても無冠のままにする', async () => {
    await nominate(database, 'movie-2losses', [{award: 3, isWinner: true}]);

    const {topMovies} = await service.getUncrowned();

    expect(topMovies.map(movie => movie.uid)).toContain('movie-2losses');
  });

  it('ノミネートされた映画の総数を返す', async () => {
    const {nominatedFilmCount} = await service.getUncrowned();

    expect(nominatedFilmCount).toBe(4);
  });

  it('無冠の映画の総数を返す', async () => {
    const {uncrownedFilmCount} = await service.getUncrowned();

    expect(uncrownedFilmCount).toBe(3);
  });

  it('論理削除された映画は数えない', async () => {
    await seedMovie(database, 'movie-deleted', {deleted: true});
    await nominate(database, 'movie-deleted', [{award: 0}, {award: 1}]);

    const {topMovies, nominatedFilmCount, uncrownedFilmCount} =
      await service.getUncrowned();

    expect(topMovies.map(movie => movie.uid)).not.toContain('movie-deleted');
    expect(nominatedFilmCount).toBe(4);
    expect(uncrownedFilmCount).toBe(3);
  });

  it('上限を超える映画は返さない', async () => {
    const {topMovies} = await service.getUncrowned({limit: 1});

    expect(topMovies.map(movie => movie.uid)).toEqual(['movie-3losses']);
  });

  it('敗北数が同じ場合は古い映画から順に返す', async () => {
    await seedMovie(database, 'movie-old', {
      defaultTitle: 'Old One Loss',
      year: 1953,
    });
    await nominate(database, 'movie-old', [{award: 1}]);

    const {topMovies} = await service.getUncrowned();

    expect(topMovies.map(movie => movie.uid)).toEqual([
      'movie-3losses',
      'movie-2losses',
      'movie-old',
      'movie-1loss',
    ]);
  });

  it('邦題があれば邦題を返す', async () => {
    const {topMovies} = await service.getUncrowned();

    expect(topMovies[0].title).toBe('三連敗の映画');
  });

  it('ポスターを返す', async () => {
    const {topMovies} = await service.getUncrowned();

    expect(topMovies[0].posterUrl).toBe('https://example.com/3losses.jpg');
  });

  it('賞ページを持たない団体のノミネーションは無視する', async () => {
    await database
      .insert(awardOrganizations)
      .values({uid: 'org-unknown', name: 'Unknown Award'});
    await database.insert(awardCategories).values({
      uid: 'cat-unknown',
      organizationUid: 'org-unknown',
      name: 'Unknown Category',
    });
    await database.insert(awardCeremonies).values({
      uid: 'ceremony-unknown',
      organizationUid: 'org-unknown',
      year: 2020,
    });
    await database.insert(nominations).values({
      movieUid: 'movie-1loss',
      ceremonyUid: 'ceremony-unknown',
      categoryUid: 'cat-unknown',
      isWinner: 1,
    });

    const {topMovies} = await service.getUncrowned();

    expect(
      topMovies.find(movie => movie.uid === 'movie-1loss')?.losses,
    ).toEqual([{slug: 'palme-dor', year: 2019}]);
  });

  it('映画祭のサブ賞の受賞は戴冠に数えない', async () => {
    await database.insert(awardCategories).values({
      uid: 'cat-grand-prix',
      organizationUid: 'org-cannes',
      name: 'Grand Prix',
    });
    await database.insert(nominations).values({
      movieUid: 'movie-1loss',
      ceremonyUid: 'ceremony-cannes',
      categoryUid: 'cat-grand-prix',
      isWinner: 1,
    });

    const {topMovies} = await service.getUncrowned();

    expect(
      topMovies.find(movie => movie.uid === 'movie-1loss')?.losses,
    ).toEqual([{slug: 'palme-dor', year: 2019}]);
  });

  it('タグ表示用に敗北のあった賞を返す', async () => {
    const {awards} = await service.getUncrowned();

    expect(awards.map(award => award.slug)).toEqual([
      'palme-dor',
      'academy-best-picture',
      'kinema-junpo-foreign',
    ]);
    expect(awards[0].shortLabel).toBe('カンヌ');
  });
});
