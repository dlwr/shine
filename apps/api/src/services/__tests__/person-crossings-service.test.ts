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
import {people} from '@shine/database/schema/people';
import {posterUrls} from '@shine/database/schema/poster-urls';
import {translations} from '@shine/database/schema/translations';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {beforeEach, describe, expect, it} from 'vitest';
import {PersonCrossingsService} from '../person-crossings-service';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../../packages/database/migrations',
);

type TestDatabase = ReturnType<typeof getDatabase>;

async function createTestEnvironment(): Promise<Environment> {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'shine-person-crossings-'),
  );
  const environment: Environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});
  await seed(database);
  return environment;
}

async function seed(database: TestDatabase): Promise<void> {
  await database.insert(awardOrganizations).values([
    {uid: 'org-kinejun', name: 'Kinema Junpo'},
    {uid: 'org-mainichi', name: 'Mainichi Film Awards'},
    {uid: 'org-japan-academy', name: 'Japan Academy Awards'},
    {uid: 'org-academy', name: 'Academy Awards'},
  ]);
  await database.insert(awardCategories).values([
    {uid: 'cat-kj-lead', organizationUid: 'org-kinejun', name: '主演男優賞'},
    {
      uid: 'cat-kj-supporting',
      organizationUid: 'org-kinejun',
      name: '助演男優賞',
    },
    {
      uid: 'cat-mainichi-lead',
      organizationUid: 'org-mainichi',
      name: '男優主演賞',
    },
    {
      uid: 'cat-ja-lead',
      organizationUid: 'org-japan-academy',
      name: '主演男優賞',
    },
    {
      uid: 'cat-academy-lead',
      organizationUid: 'org-academy',
      name: 'Academy Award for Best Actor',
    },
    {
      uid: 'cat-best-picture',
      organizationUid: 'org-academy',
      name: 'Academy Award for Best Picture',
    },
  ]);
  await database.insert(awardCeremonies).values([
    {uid: 'ceremony-kj-1996', organizationUid: 'org-kinejun', year: 1996},
    {uid: 'ceremony-kj-2000', organizationUid: 'org-kinejun', year: 2000},
    {
      uid: 'ceremony-mainichi-1996',
      organizationUid: 'org-mainichi',
      year: 1996,
    },
    {
      uid: 'ceremony-mainichi-2000',
      organizationUid: 'org-mainichi',
      year: 2000,
    },
    {uid: 'ceremony-ja-1997', organizationUid: 'org-japan-academy', year: 1997},
    {uid: 'ceremony-academy-2000', organizationUid: 'org-academy', year: 2000},
  ]);

  await database.insert(movies).values([
    {uid: 'movie-shall-we', year: 1996},
    {uid: 'movie-shabu', year: 1996},
    {uid: 'movie-late', year: 2000},
    {uid: 'movie-picture', year: 2000},
    {uid: 'movie-deleted', year: 2000, deletedAt: 1_700_000_000},
  ]);
  await database.insert(translations).values([
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-shall-we',
      languageCode: 'ja',
      content: 'Shall we ダンス？',
      isDefault: 1,
    },
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-shabu',
      languageCode: 'ja',
      content: 'シャブ極道',
      isDefault: 1,
    },
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-late',
      languageCode: 'en',
      content: 'Movie 2000',
      isDefault: 1,
    },
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-late',
      languageCode: 'ja',
      content: '映画2000',
    },
    {
      resourceType: 'person_name',
      resourceUid: 'person-foreign',
      languageCode: 'ja',
      content: 'トム・ハンクス',
    },
  ]);
  await database.insert(posterUrls).values([
    {
      movieUid: 'movie-shall-we',
      url: 'https://example.com/shall-we.jpg',
      isPrimary: 1,
    },
  ]);

  await database.insert(people).values([
    {uid: 'person-yakusho', tmdbId: 1, name: '役所広司', profilePath: '/y.jpg'},
    {uid: 'person-foreign', tmdbId: 2, name: 'Tom Hanks'},
    {uid: 'person-double', tmdbId: 3, name: '同じ団体で二冠'},
    {uid: 'person-nominee', tmdbId: 4, name: 'ノミネートだけ'},
    {uid: 'person-deleted', tmdbId: 5, name: '消えた映画の受賞者'},
  ]);

  await database.insert(nominations).values([
    {
      movieUid: 'movie-shall-we',
      ceremonyUid: 'ceremony-kj-1996',
      categoryUid: 'cat-kj-lead',
      personUid: 'person-yakusho',
      isWinner: 1,
    },
    {
      movieUid: 'movie-shabu',
      ceremonyUid: 'ceremony-kj-1996',
      categoryUid: 'cat-kj-lead',
      personUid: 'person-yakusho',
      isWinner: 1,
    },
    {
      movieUid: 'movie-shall-we',
      ceremonyUid: 'ceremony-mainichi-1996',
      categoryUid: 'cat-mainichi-lead',
      personUid: 'person-yakusho',
      isWinner: 1,
    },
    {
      movieUid: 'movie-shall-we',
      ceremonyUid: 'ceremony-ja-1997',
      categoryUid: 'cat-ja-lead',
      personUid: 'person-yakusho',
      isWinner: 1,
    },
    {
      movieUid: 'movie-late',
      ceremonyUid: 'ceremony-academy-2000',
      categoryUid: 'cat-academy-lead',
      personUid: 'person-foreign',
      isWinner: 1,
    },
    {
      movieUid: 'movie-late',
      ceremonyUid: 'ceremony-mainichi-2000',
      categoryUid: 'cat-mainichi-lead',
      personUid: 'person-foreign',
      isWinner: 1,
    },
    {
      movieUid: 'movie-late',
      ceremonyUid: 'ceremony-kj-2000',
      categoryUid: 'cat-kj-lead',
      personUid: 'person-double',
      isWinner: 1,
    },
    {
      movieUid: 'movie-late',
      ceremonyUid: 'ceremony-kj-2000',
      categoryUid: 'cat-kj-supporting',
      personUid: 'person-double',
      isWinner: 1,
    },
    {
      movieUid: 'movie-late',
      ceremonyUid: 'ceremony-academy-2000',
      categoryUid: 'cat-academy-lead',
      personUid: 'person-nominee',
      isWinner: 0,
    },
    {
      movieUid: 'movie-deleted',
      ceremonyUid: 'ceremony-kj-2000',
      categoryUid: 'cat-kj-lead',
      personUid: 'person-deleted',
      isWinner: 1,
    },
    {
      movieUid: 'movie-picture',
      ceremonyUid: 'ceremony-academy-2000',
      categoryUid: 'cat-best-picture',
      isWinner: 1,
    },
  ]);
}

describe('PersonCrossingsService.getPersonCrossings', () => {
  let service: PersonCrossingsService;

  beforeEach(async () => {
    service = new PersonCrossingsService(await createTestEnvironment());
  });

  it('ひとつの演技が受賞した団体数を数える', async () => {
    const {topPerformances} = await service.getPersonCrossings({locale: 'ja'});

    expect(topPerformances[0]).toMatchObject({
      person: {uid: 'person-yakusho', name: '役所広司', profilePath: '/y.jpg'},
      movie: {
        uid: 'movie-shall-we',
        title: 'Shall we ダンス？',
        year: 1996,
        posterUrl: 'https://example.com/shall-we.jpg',
      },
      organizationCount: 3,
    });
  });

  it('受賞した部門を賞ページの slug と日本語名で返す', async () => {
    const {topPerformances} = await service.getPersonCrossings({locale: 'ja'});

    expect(topPerformances[0].awards).toEqual([
      {
        slug: 'japan-academy-lead-actor',
        organization: '日本アカデミー賞',
        category: '主演男優賞',
      },
      {
        slug: 'kinema-junpo-lead-actor',
        organization: 'キネマ旬報',
        category: '主演男優賞',
      },
      {
        slug: 'mainichi-lead-actor',
        organization: '毎日映画コンクール',
        category: '男優主演賞',
      },
    ]);
  });

  it('同じ授賞式で複数作品に付いた受賞は作品ごとに数える', async () => {
    const {topPerformances} = await service.getPersonCrossings({locale: 'ja'});

    const shabu = topPerformances.find(
      entry => entry.movie.uid === 'movie-shabu',
    );
    expect(shabu).toMatchObject({
      person: {uid: 'person-yakusho'},
      organizationCount: 1,
    });
  });

  it('同じ団体の2部門は1団体と数える', async () => {
    const {topPerformances} = await service.getPersonCrossings({locale: 'ja'});

    const double = topPerformances.find(
      entry => entry.person.uid === 'person-double',
    );
    expect(double?.organizationCount).toBe(1);
    expect(double?.awards.map(award => award.slug)).toEqual([
      'kinema-junpo-lead-actor',
      'kinema-junpo-supporting-actor',
    ]);
  });

  it('ノミネートは数えない', async () => {
    const {topPerformances} = await service.getPersonCrossings({locale: 'ja'});

    expect(
      topPerformances.some(entry => entry.person.uid === 'person-nominee'),
    ).toBe(false);
  });

  it('削除済み映画の受賞は数えない', async () => {
    const {topPerformances} = await service.getPersonCrossings({locale: 'ja'});

    expect(
      topPerformances.some(entry => entry.person.uid === 'person-deleted'),
    ).toBe(false);
  });

  it('作品賞は数えない', async () => {
    const {topPerformances, organizations} = await service.getPersonCrossings({
      locale: 'ja',
    });

    expect(
      topPerformances.some(entry => entry.movie.uid === 'movie-picture'),
    ).toBe(false);
    expect(organizations.find(entry => entry.key === 'academy')).toMatchObject({
      performanceCount: 1,
    });
  });

  it('団体数が多い順、年が新しい順に並べる', async () => {
    const {topPerformances} = await service.getPersonCrossings({locale: 'ja'});

    expect(
      topPerformances.map(entry => [entry.person.uid, entry.movie.uid]),
    ).toEqual([
      ['person-yakusho', 'movie-shall-we'],
      ['person-foreign', 'movie-late'],
      ['person-double', 'movie-late'],
      ['person-yakusho', 'movie-shabu'],
    ]);
  });

  it('limit で件数を絞る', async () => {
    const {topPerformances} = await service.getPersonCrossings({
      locale: 'ja',
      limit: 1,
    });

    expect(topPerformances).toHaveLength(1);
  });

  it('団体ごとの受賞した演技の数を返す', async () => {
    const {organizations} = await service.getPersonCrossings({locale: 'ja'});

    expect(
      organizations.map(entry => [
        entry.key,
        entry.name,
        entry.performanceCount,
      ]),
    ).toEqual([
      ['academy', 'アカデミー賞', 1],
      ['japan-academy', '日本アカデミー賞', 1],
      ['kinema-junpo', 'キネマ旬報', 3],
      ['mainichi', '毎日映画コンクール', 2],
    ]);
  });

  it('両方の団体が同じ演技を選んだ回数を返す', async () => {
    const {pairs} = await service.getPersonCrossings({locale: 'ja'});

    expect(pairs).toEqual([
      {a: 'academy', b: 'mainichi', shared: 1},
      {a: 'japan-academy', b: 'kinema-junpo', shared: 1},
      {a: 'japan-academy', b: 'mainichi', shared: 1},
      {a: 'kinema-junpo', b: 'mainichi', shared: 1},
    ]);
  });

  it('団体数ごとの演技の数を返す', async () => {
    const {distribution} = await service.getPersonCrossings({locale: 'ja'});

    expect(distribution).toEqual([
      {organizationCount: 3, performanceCount: 1},
      {organizationCount: 2, performanceCount: 1},
      {organizationCount: 1, performanceCount: 2},
    ]);
  });

  it('locale が ja なら日本語名と邦題を返す', async () => {
    const {topPerformances} = await service.getPersonCrossings({locale: 'ja'});

    expect(topPerformances[1]).toMatchObject({
      person: {name: 'トム・ハンクス'},
      movie: {title: '映画2000'},
    });
  });

  it('locale が en なら原語名と既定の題を返す', async () => {
    const {topPerformances} = await service.getPersonCrossings({locale: 'en'});

    expect(topPerformances[1]).toMatchObject({
      person: {name: 'Tom Hanks'},
      movie: {title: 'Movie 2000'},
    });
  });
});
