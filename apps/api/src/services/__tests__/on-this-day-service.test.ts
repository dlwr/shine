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
import {migrate} from '@shine/database/testing';
import {beforeEach, describe, expect, it} from 'vitest';
import {OnThisDayService} from '../on-this-day-service';

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
    path.join(os.tmpdir(), 'shine-on-this-day-'),
  );
  const environment: Environment = {
    DATABASE_FILE_URL: `file:${path.join(directory, 'test.db')}`,
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
    releaseDate?: string;
    posterUrl?: string;
    deleted?: boolean;
  } = {},
): Promise<void> {
  await database.insert(movies).values({
    uid,
    releaseDate: options.releaseDate,
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

describe('OnThisDayService.getOnThisDay', () => {
  let service: OnThisDayService;
  let database: TestDatabase;

  beforeEach(async () => {
    const created = await createTestEnvironment();
    database = created.database;
    service = new OnThisDayService(created.environment);
    await seedAwards(database);
    await seedMovie(database, 'movie-1999', {
      jaTitle: '九九年の映画',
      releaseDate: '1999-09-15',
      posterUrl: 'https://example.com/1999.jpg',
    });
    await seedMovie(database, 'movie-1962', {releaseDate: '1962-09-15'});
    await seedMovie(database, 'movie-2010', {releaseDate: '2010-09-15'});
    await seedMovie(database, 'movie-other-day', {releaseDate: '1999-09-16'});
    await seedMovie(database, 'movie-undated');
    await seedMovie(database, 'movie-deleted', {
      releaseDate: '1980-09-15',
      deleted: true,
    });
    await seedMovie(database, 'movie-unnominated', {releaseDate: '1970-09-15'});
    await nominate(database, 'movie-1999', [{award: 0}, {award: 1, isWinner: true}]);
    await nominate(database, 'movie-1962', [{award: 0}]);
    await nominate(database, 'movie-2010', [{award: 1}]);
    await nominate(database, 'movie-other-day', [{award: 0}]);
    await nominate(database, 'movie-undated', [{award: 0}]);
    await nominate(database, 'movie-deleted', [{award: 0}]);
  });

  it('その月日に初公開されたノミネート作を古い順に返す', async () => {
    const {movies: result} = await service.getOnThisDay('09-15');

    expect(result.map(movie => movie.uid)).toEqual([
      'movie-1962',
      'movie-1999',
      'movie-2010',
    ]);
  });

  it('ソフト削除された映画は含めない', async () => {
    const {movies: result} = await service.getOnThisDay('09-15');

    expect(result.map(movie => movie.uid)).not.toContain('movie-deleted');
  });

  it('賞にノミネートされていない映画は含めない', async () => {
    const {movies: result} = await service.getOnThisDay('09-15');

    expect(result.map(movie => movie.uid)).not.toContain('movie-unnominated');
  });

  it('題名は日本語を優先する', async () => {
    const {movies: result} = await service.getOnThisDay('09-15');

    expect(result.find(movie => movie.uid === 'movie-1999')?.title).toBe(
      '九九年の映画',
    );
  });

  it('公開日を返す', async () => {
    const {movies: result} = await service.getOnThisDay('09-15');

    expect(result.find(movie => movie.uid === 'movie-1999')?.releaseDate).toBe(
      '1999-09-15',
    );
  });

  it('ポスターを返す', async () => {
    const {movies: result} = await service.getOnThisDay('09-15');

    expect(result.find(movie => movie.uid === 'movie-1999')?.posterUrl).toBe(
      'https://example.com/1999.jpg',
    );
  });

  it('どれかの賞で受賞していれば受賞作とする', async () => {
    const {movies: result} = await service.getOnThisDay('09-15');

    expect(result.find(movie => movie.uid === 'movie-1999')?.isWinner).toBe(
      true,
    );
  });

  it('賞ごとの受賞の有無を返す', async () => {
    const {movies: result} = await service.getOnThisDay('09-15');

    expect(
      result
        .find(movie => movie.uid === 'movie-1999')
        ?.awards.toSorted((a, b) => a.slug.localeCompare(b.slug)),
    ).toEqual([
      {slug: 'academy-best-picture', isWinner: true},
      {slug: 'palme-dor', isWinner: false},
    ]);
  });

  it('載っている賞の凡例を返す', async () => {
    const {awards} = await service.getOnThisDay('09-15');

    expect(awards.map(award => award.slug).toSorted()).toEqual([
      'academy-best-picture',
      'palme-dor',
    ]);
  });

  it('該当が無い日は空の一覧を返す', async () => {
    const {movies: result} = await service.getOnThisDay('02-29');

    expect(result).toEqual([]);
  });
});
