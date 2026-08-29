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
import {CrossingsService} from '../crossings-service';

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
    path.join(os.tmpdir(), 'shine-crossings-'),
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
  },
  {
    orgUid: 'org-academy',
    orgName: 'Academy Awards',
    categoryUid: 'cat-best-picture',
    categoryName: 'Academy Award for Best Picture',
    ceremonyUid: 'ceremony-academy',
  },
  {
    orgUid: 'org-kinejun',
    orgName: 'Kinema Junpo',
    categoryUid: 'cat-kj-foreign',
    categoryName: 'Best Foreign Film',
    ceremonyUid: 'ceremony-kinejun',
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
      year: 2020,
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
  awardIndexes: number[],
): Promise<void> {
  await database.insert(nominations).values(
    awardIndexes.map(index => ({
      movieUid,
      ceremonyUid: AWARDS[index].ceremonyUid,
      categoryUid: AWARDS[index].categoryUid,
    })),
  );
}

describe('CrossingsService.getCrossings', () => {
  let service: CrossingsService;
  let database: TestDatabase;

  beforeEach(async () => {
    const created = await createTestEnvironment();
    database = created.database;
    service = new CrossingsService(created.environment);
    await seedAwards(database);
    await seedMovie(database, 'movie-1', {
      jaTitle: '三冠の映画',
      year: 2019,
      posterUrl: 'https://example.com/1.jpg',
    });
    await seedMovie(database, 'movie-2', {defaultTitle: 'Two Awards'});
    await seedMovie(database, 'movie-3', {defaultTitle: 'One Award'});
    await nominate(database, 'movie-1', [0, 1, 2]);
    await nominate(database, 'movie-2', [0, 1]);
    await nominate(database, 'movie-3', [0]);
  });

  it('賞ごとの作品数を返す', async () => {
    const {awards} = await service.getCrossings();

    expect(awards.find(award => award.slug === 'palme-dor')?.filmCount).toBe(3);
    expect(
      awards.find(award => award.slug === 'academy-best-picture')?.filmCount,
    ).toBe(2);
  });

  it('軸に使う短い賞名を返す', async () => {
    const {awards} = await service.getCrossings();

    expect(awards.find(award => award.slug === 'palme-dor')?.shortLabel).toBe(
      'カンヌ',
    );
  });

  it('ノミネーションが無い賞は返さない', async () => {
    const {awards} = await service.getCrossings();

    expect(
      awards.some(award => award.slug === 'kinema-junpo-japanese'),
    ).toBeFalsy();
  });

  it('2つの賞に共通する映画の本数を返す', async () => {
    const {pairs} = await service.getCrossings();
    const pair = pairs.find(
      entry => entry.a === 'academy-best-picture' && entry.b === 'palme-dor',
    );

    expect(pair?.shared).toBe(2);
  });

  it('共通する映画が無い組み合わせは返さない', async () => {
    await database.delete(nominations);
    await nominate(database, 'movie-1', [0]);
    await nominate(database, 'movie-2', [1]);

    const {pairs} = await service.getCrossings();

    expect(pairs).toHaveLength(0);
  });

  it('重なりの多い組み合わせから順に返す', async () => {
    const {pairs} = await service.getCrossings();

    expect(pairs.map(pair => pair.shared)).toEqual([2, 1, 1]);
  });

  it('選ばれた賞の数が多い映画から順に返す', async () => {
    const {topMovies} = await service.getCrossings();

    expect(topMovies.map(movie => movie.uid)).toEqual([
      'movie-1',
      'movie-2',
      'movie-3',
    ]);
  });

  it('上限を超える映画は返さない', async () => {
    const {topMovies} = await service.getCrossings({limit: 1});

    expect(topMovies.map(movie => movie.uid)).toEqual(['movie-1']);
  });

  it('映画が選ばれた賞のslugを返す', async () => {
    const {topMovies} = await service.getCrossings();

    expect(topMovies[0].awardSlugs).toEqual([
      'academy-best-picture',
      'kinema-junpo-foreign',
      'palme-dor',
    ]);
  });

  it('邦題があれば邦題を返す', async () => {
    const {topMovies} = await service.getCrossings();

    expect(topMovies[0].title).toBe('三冠の映画');
  });

  it('ポスターを返す', async () => {
    const {topMovies} = await service.getCrossings();

    expect(topMovies[0].posterUrl).toBe('https://example.com/1.jpg');
  });

  it('賞の数ごとの本数を多い順に返す', async () => {
    const {distribution} = await service.getCrossings();

    expect(distribution).toEqual([
      {awardCount: 3, filmCount: 1},
      {awardCount: 2, filmCount: 1},
      {awardCount: 1, filmCount: 1},
    ]);
  });

  it('論理削除された映画は数えない', async () => {
    await seedMovie(database, 'movie-deleted', {deleted: true});
    await nominate(database, 'movie-deleted', [0, 1]);

    const {awards, topMovies} = await service.getCrossings();

    expect(awards.find(award => award.slug === 'palme-dor')?.filmCount).toBe(3);
    expect(topMovies.map(movie => movie.uid)).not.toContain('movie-deleted');
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
      movieUid: 'movie-3',
      ceremonyUid: 'ceremony-unknown',
      categoryUid: 'cat-unknown',
    });

    const {awards, topMovies} = await service.getCrossings();

    expect(awards.some(award => award.slug === undefined)).toBeFalsy();
    expect(
      topMovies.find(movie => movie.uid === 'movie-3')?.awardSlugs,
    ).toEqual(['palme-dor']);
  });

  it('映画祭のサブ賞は同じ映画祭の出品と重ねて数えない', async () => {
    await database.insert(awardCategories).values({
      uid: 'cat-grand-prix',
      organizationUid: 'org-cannes',
      name: 'Grand Prix',
    });
    await database.insert(nominations).values({
      movieUid: 'movie-3',
      ceremonyUid: 'ceremony-cannes',
      categoryUid: 'cat-grand-prix',
      isWinner: 1,
    });

    const {awards, topMovies} = await service.getCrossings();

    expect(awards.map(award => award.slug)).not.toContain('cannes-grand-prix');
    expect(
      topMovies.find(movie => movie.uid === 'movie-3')?.awardSlugs,
    ).toEqual(['palme-dor']);
  });
});
