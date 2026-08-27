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
import {
  awardPageLinkForOrganizationName,
  AwardsService,
  findPersonAwardDefinition,
  japaneseAwardNames,
  paginateAwardDetail,
  personAwardDefinitions,
} from '../awards-service';

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
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-test-'));
  const environment: Environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});
  return {environment, database};
}

async function seedCannes(database: TestDatabase): Promise<void> {
  await database
    .insert(awardOrganizations)
    .values({uid: 'org-cannes', name: 'Cannes Film Festival'});
  await database.insert(awardCategories).values({
    uid: 'cat-palme',
    organizationUid: 'org-cannes',
    name: "Palme d'Or",
  });
}

async function seedCannesCeremony(
  database: TestDatabase,
  uid: string,
  year: number,
  ceremonyNumber?: number,
): Promise<void> {
  await database
    .insert(awardCeremonies)
    .values({uid, organizationUid: 'org-cannes', year, ceremonyNumber});
}

async function seedMovie(
  database: TestDatabase,
  uid: string,
  title: string,
  options: {year?: number; jaTitle?: string} = {},
): Promise<void> {
  await database.insert(movies).values({uid, year: options.year ?? 2020});
  await database.insert(translations).values({
    resourceType: 'movie_title',
    resourceUid: uid,
    languageCode: 'en',
    content: title,
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
}

async function seedKinemaJunpo(database: TestDatabase): Promise<void> {
  await database
    .insert(awardOrganizations)
    .values({uid: 'org-kinejun', name: 'Kinema Junpo'});
  await database.insert(awardCategories).values({
    uid: 'cat-kj-japanese',
    organizationUid: 'org-kinejun',
    name: 'Best Japanese Film',
  });
  await database.insert(awardCeremonies).values({
    uid: 'ceremony-kj-1956',
    organizationUid: 'org-kinejun',
    year: 1956,
    ceremonyNumber: 30,
  });
  await seedMovie(database, 'movie-kj-1', 'Darkness at Noon');
  await seedMovie(database, 'movie-kj-2', 'Yoru no kawa');
  await seedMovie(database, 'movie-kj-3', 'Karakoram');
  await database.insert(nominations).values([
    {
      movieUid: 'movie-kj-3',
      ceremonyUid: 'ceremony-kj-1956',
      categoryUid: 'cat-kj-japanese',
      specialMention: '3位',
    },
    {
      movieUid: 'movie-kj-1',
      ceremonyUid: 'ceremony-kj-1956',
      categoryUid: 'cat-kj-japanese',
      isWinner: 1,
      specialMention: '1位',
    },
    {
      movieUid: 'movie-kj-2',
      ceremonyUid: 'ceremony-kj-1956',
      categoryUid: 'cat-kj-japanese',
      specialMention: '2位',
    },
  ]);
}

describe('AwardsService.getAwardYear ランキング', () => {
  let environment: Environment;
  let database: TestDatabase;
  let service: AwardsService;

  beforeEach(async () => {
    ({environment, database} = await createTestEnvironment());
    service = new AwardsService(environment);
    await seedKinemaJunpo(database);
  });

  it('順位の昇順で並べる', async () => {
    const result = await service.getAwardYear('kinema-junpo-japanese', 1956);

    expect(result?.movies.map(movie => movie.uid)).toEqual([
      'movie-kj-1',
      'movie-kj-2',
      'movie-kj-3',
    ]);
  });

  it('順位を返す', async () => {
    const result = await service.getAwardYear('kinema-junpo-japanese', 1956);

    expect(result?.movies.map(movie => movie.specialMention)).toEqual([
      '1位',
      '2位',
      '3位',
    ]);
  });
});

describe('AwardsService.getAwardBySlug', () => {
  let environment: Environment;
  let database: TestDatabase;
  let service: AwardsService;

  beforeEach(async () => {
    ({environment, database} = await createTestEnvironment());
    service = new AwardsService(environment);
  });

  it('returns undefined for an unknown slug', async () => {
    const result = await service.getAwardBySlug('no-such-award');
    expect(result).toBeUndefined();
  });

  it('returns undefined when the organization has no nominations', async () => {
    await seedCannes(database);
    const result = await service.getAwardBySlug('palme-dor');
    expect(result).toBeUndefined();
  });

  it('groups movies by ceremony year in descending order', async () => {
    await seedCannes(database);
    await seedCannesCeremony(database, 'ceremony-2021', 2021);
    await seedCannesCeremony(database, 'ceremony-2022', 2022);
    await seedCannesCeremony(database, 'ceremony-2023', 2023);
    await seedMovie(database, 'movie-a', 'Movie A');
    await seedMovie(database, 'movie-b', 'Movie B');
    await seedMovie(database, 'movie-c', 'Movie C');
    await database.insert(nominations).values([
      {
        movieUid: 'movie-b',
        ceremonyUid: 'ceremony-2022',
        categoryUid: 'cat-palme',
      },
      {
        movieUid: 'movie-a',
        ceremonyUid: 'ceremony-2021',
        categoryUid: 'cat-palme',
      },
      {
        movieUid: 'movie-c',
        ceremonyUid: 'ceremony-2023',
        categoryUid: 'cat-palme',
      },
    ]);

    const result = await service.getAwardBySlug('palme-dor');

    expect(result?.years.map(group => group.year)).toEqual([2023, 2022, 2021]);
  });

  it('places the winner before other nominees within a year', async () => {
    await seedCannes(database);
    await seedCannesCeremony(database, 'ceremony-2023', 2023, 76);
    await seedMovie(database, 'movie-a', 'A Nominee');
    await seedMovie(database, 'movie-b', 'B Winner');
    await seedMovie(database, 'movie-c', 'C Nominee');
    await database.insert(nominations).values([
      {
        movieUid: 'movie-a',
        ceremonyUid: 'ceremony-2023',
        categoryUid: 'cat-palme',
      },
      {
        movieUid: 'movie-b',
        ceremonyUid: 'ceremony-2023',
        categoryUid: 'cat-palme',
        isWinner: 1,
      },
      {
        movieUid: 'movie-c',
        ceremonyUid: 'ceremony-2023',
        categoryUid: 'cat-palme',
      },
    ]);

    const result = await service.getAwardBySlug('palme-dor');

    const yearGroup = result?.years[0];
    expect(yearGroup?.movies[0]).toMatchObject({
      uid: 'movie-b',
      isWinner: true,
    });
  });

  it('prefers the Japanese title over the default title', async () => {
    await seedCannes(database);
    await seedCannesCeremony(database, 'ceremony-2023', 2023);
    await seedMovie(database, 'movie-a', 'Anatomy of a Fall', {
      jaTitle: '落下の解剖学',
    });
    await database.insert(nominations).values({
      movieUid: 'movie-a',
      ceremonyUid: 'ceremony-2023',
      categoryUid: 'cat-palme',
      isWinner: 1,
    });

    const result = await service.getAwardBySlug('palme-dor');

    expect(result?.years[0]?.movies[0]?.title).toBe('落下の解剖学');
  });

  it('falls back to the default title when no Japanese title exists', async () => {
    await seedCannes(database);
    await seedCannesCeremony(database, 'ceremony-2023', 2023);
    await seedMovie(database, 'movie-a', 'Titane');
    await database.insert(nominations).values({
      movieUid: 'movie-a',
      ceremonyUid: 'ceremony-2023',
      categoryUid: 'cat-palme',
      isWinner: 1,
    });

    const result = await service.getAwardBySlug('palme-dor');

    expect(result?.years[0]?.movies[0]?.title).toBe('Titane');
  });

  it('uses the primary poster url', async () => {
    await seedCannes(database);
    await seedCannesCeremony(database, 'ceremony-2023', 2023);
    await seedMovie(database, 'movie-a', 'Movie A');
    await database.insert(posterUrls).values([
      {movieUid: 'movie-a', url: 'https://example.com/secondary.jpg'},
      {
        movieUid: 'movie-a',
        url: 'https://example.com/primary.jpg',
        isPrimary: 1,
      },
    ]);
    await database.insert(nominations).values({
      movieUid: 'movie-a',
      ceremonyUid: 'ceremony-2023',
      categoryUid: 'cat-palme',
      isWinner: 1,
    });

    const result = await service.getAwardBySlug('palme-dor');

    expect(result?.years[0]?.movies[0]?.posterUrl).toBe(
      'https://example.com/primary.jpg',
    );
  });

  it('merges Japan Academy categories and dedupes movies within a year', async () => {
    await database
      .insert(awardOrganizations)
      .values({uid: 'org-japan', name: 'Japan Academy Awards'});
    await database.insert(awardCategories).values([
      {uid: 'cat-yushu', organizationUid: 'org-japan', name: '優秀作品賞'},
      {uid: 'cat-saiyushu', organizationUid: 'org-japan', name: '最優秀作品賞'},
    ]);
    await database
      .insert(awardCeremonies)
      .values({uid: 'ceremony-2024', organizationUid: 'org-japan', year: 2024});
    await seedMovie(database, 'movie-winner', 'ゴジラ-1.0');
    await seedMovie(database, 'movie-nominee', '怪物');
    await database.insert(nominations).values([
      {
        movieUid: 'movie-winner',
        ceremonyUid: 'ceremony-2024',
        categoryUid: 'cat-yushu',
      },
      {
        movieUid: 'movie-winner',
        ceremonyUid: 'ceremony-2024',
        categoryUid: 'cat-saiyushu',
        isWinner: 1,
      },
      {
        movieUid: 'movie-nominee',
        ceremonyUid: 'ceremony-2024',
        categoryUid: 'cat-yushu',
      },
    ]);

    const result = await service.getAwardBySlug('japan-academy-best-picture');

    const yearGroup = result?.years[0];
    expect(yearGroup?.filmCount).toBe(2);
    expect(yearGroup?.movies).toHaveLength(1);
    expect(yearGroup?.movies[0]).toMatchObject({
      uid: 'movie-winner',
      isWinner: true,
    });
  });
});

describe('AwardsService.getAwardBySlug 年別グルーピング', () => {
  let environment: Environment;
  let database: TestDatabase;
  let service: AwardsService;

  beforeEach(async () => {
    ({environment, database} = await createTestEnvironment());
    service = new AwardsService(environment);
    await seedCannes(database);
    await seedCannesCeremony(database, 'ceremony-2023', 2023, 76);
    await seedMovie(database, 'movie-winner', 'Anatomy of a Fall');
    await seedMovie(database, 'movie-a', 'The Zone of Interest');
    await seedMovie(database, 'movie-b', 'Perfect Days');
    await database.insert(nominations).values([
      {
        movieUid: 'movie-winner',
        ceremonyUid: 'ceremony-2023',
        categoryUid: 'cat-palme',
        isWinner: 1,
      },
      {
        movieUid: 'movie-a',
        ceremonyUid: 'ceremony-2023',
        categoryUid: 'cat-palme',
      },
      {
        movieUid: 'movie-b',
        ceremonyUid: 'ceremony-2023',
        categoryUid: 'cat-palme',
      },
    ]);
  });

  it('受賞作のみを返す', async () => {
    const result = await service.getAwardBySlug('palme-dor');

    expect(result?.years[0]?.movies.map(movie => movie.uid)).toEqual([
      'movie-winner',
    ]);
  });

  it('出品作の総数をfilmCountで返す', async () => {
    const result = await service.getAwardBySlug('palme-dor');

    expect(result?.years[0]?.filmCount).toBe(3);
  });

  it('受賞作がない回も回次と件数を返す', async () => {
    await seedCannesCeremony(database, 'ceremony-1968', 1968, 21);
    await seedMovie(database, 'movie-c', 'Aborted Year Film');
    await database.insert(nominations).values({
      movieUid: 'movie-c',
      ceremonyUid: 'ceremony-1968',
      categoryUid: 'cat-palme',
    });

    const result = await service.getAwardBySlug('palme-dor');

    const group = result?.years.find(entry => entry.year === 1968);
    expect(group?.movies).toEqual([]);
    expect(group?.filmCount).toBe(1);
    expect(group?.ceremonyNumber).toBe(21);
  });

  it('ページ情報は返さない', async () => {
    const result = await service.getAwardBySlug('palme-dor');

    expect(result?.pagination).toBeUndefined();
  });
});

describe('AwardsService.getAwardBySlug リスト型のページ分割', () => {
  let environment: Environment;
  let database: TestDatabase;
  let service: AwardsService;

  beforeEach(async () => {
    ({environment, database} = await createTestEnvironment());
    service = new AwardsService(environment);
    await database.insert(awardOrganizations).values({
      uid: 'org-1001',
      name: '1001 Movies You Must See Before You Die',
    });
    await database.insert(awardCategories).values({
      uid: 'cat-1001',
      organizationUid: 'org-1001',
      name: 'Selected Films',
    });
    await database
      .insert(awardCeremonies)
      .values({uid: 'ceremony-1001', organizationUid: 'org-1001', year: 2025});

    const seeds = Array.from({length: 150}, (_, index) => ({
      uid: `movie-${String(index).padStart(3, '0')}`,
      title: `Film ${index}`,
      year: 2000 + index,
    }));
    await database
      .insert(movies)
      .values(seeds.map(seed => ({uid: seed.uid, year: seed.year})));
    await database.insert(translations).values(
      seeds.map(seed => ({
        resourceType: 'movie_title' as const,
        resourceUid: seed.uid,
        languageCode: 'en',
        content: seed.title,
        isDefault: 1,
      })),
    );
    await database.insert(nominations).values(
      seeds.map(seed => ({
        movieUid: seed.uid,
        ceremonyUid: 'ceremony-1001',
        categoryUid: 'cat-1001',
      })),
    );
  });

  it('サービスは全件を返しページ情報を持たない', async () => {
    const result = await service.getAwardBySlug('1001-movies');

    expect(result?.years[0]?.movies).toHaveLength(150);
    expect(result?.pagination).toBeUndefined();
  });

  it('1ページ目は100件を返す', async () => {
    const full = await service.getAwardBySlug('1001-movies');
    const result = paginateAwardDetail(full!, 1);

    expect(result?.years[0]?.movies).toHaveLength(100);
    expect(result?.pagination).toMatchObject({
      page: 1,
      perPage: 100,
      totalCount: 150,
      totalPages: 2,
    });
  });

  it('2ページ目は残りを返す', async () => {
    const full = await service.getAwardBySlug('1001-movies');
    const result = paginateAwardDetail(full!, 2);

    expect(result?.years[0]?.movies).toHaveLength(50);
    expect(result?.pagination?.page).toBe(2);
  });

  it('ページをまたいで重複しない', async () => {
    const full = await service.getAwardBySlug('1001-movies');
    const uids = [
      ...(paginateAwardDetail(full!, 1)?.years[0]?.movies ?? []),
      ...(paginateAwardDetail(full!, 2)?.years[0]?.movies ?? []),
    ].map(movie => movie.uid);

    expect(new Set(uids).size).toBe(150);
  });

  it('公開年の新しい順に並べる', async () => {
    const full = await service.getAwardBySlug('1001-movies');
    const years = (full?.years[0]?.movies ?? []).map(movie => movie.movieYear);

    expect(years).toEqual(years.toSorted((a, b) => (b ?? 0) - (a ?? 0)));
  });

  it('範囲外のページはundefinedを返す', async () => {
    const full = await service.getAwardBySlug('1001-movies');

    expect(paginateAwardDetail(full!, 3)).toBeUndefined();
  });

  it('filmCountは総数を返す', async () => {
    const full = await service.getAwardBySlug('1001-movies');
    const result = paginateAwardDetail(full!, 2);

    expect(result?.years[0]?.filmCount).toBe(150);
  });

  it('年別グルーピングの賞はそのまま返す', async () => {
    const award = {
      slug: 'palme-dor',
      name: 'x',
      organization: 'y',
      description: 'z',
      grouping: 'year' as const,
      years: [{year: 2023, ceremonyNumber: 76, filmCount: 21, movies: []}],
    };

    expect(paginateAwardDetail(award, 1)).toBe(award);
  });
});

describe('AwardsService.listAwards', () => {
  let environment: Environment;
  let database: TestDatabase;
  let service: AwardsService;

  beforeEach(async () => {
    ({environment, database} = await createTestEnvironment());
    service = new AwardsService(environment);
  });

  it('returns only awards that have nominations', async () => {
    await seedCannes(database);
    await seedCannesCeremony(database, 'ceremony-2023', 2023);
    await seedMovie(database, 'movie-a', 'Movie A');
    await database.insert(nominations).values({
      movieUid: 'movie-a',
      ceremonyUid: 'ceremony-2023',
      categoryUid: 'cat-palme',
    });

    const result = await service.listAwards();

    expect(result.map(award => award.slug)).toEqual(['palme-dor']);
  });

  it('includes movie count and ceremony year range', async () => {
    await seedCannes(database);
    await seedCannesCeremony(database, 'ceremony-2021', 2021);
    await seedCannesCeremony(database, 'ceremony-2022', 2022);
    await seedCannesCeremony(database, 'ceremony-2023', 2023);
    await seedMovie(database, 'movie-a', 'Movie A');
    await seedMovie(database, 'movie-b', 'Movie B');
    await seedMovie(database, 'movie-c', 'Movie C');
    await database.insert(nominations).values([
      {
        movieUid: 'movie-a',
        ceremonyUid: 'ceremony-2021',
        categoryUid: 'cat-palme',
      },
      {
        movieUid: 'movie-b',
        ceremonyUid: 'ceremony-2022',
        categoryUid: 'cat-palme',
      },
      {
        movieUid: 'movie-c',
        ceremonyUid: 'ceremony-2023',
        categoryUid: 'cat-palme',
      },
    ]);

    const result = await service.listAwards();

    expect(result[0]).toMatchObject({
      slug: 'palme-dor',
      movieCount: 3,
      firstYear: 2021,
      lastYear: 2023,
    });
  });
});

describe('awardPageLinkForOrganizationName', () => {
  it('returns the slug and year-page availability for a year-grouped award', () => {
    expect(awardPageLinkForOrganizationName('Cannes Film Festival')).toEqual({
      slug: 'palme-dor',
      hasYearPages: true,
    });
  });

  it('returns hasYearPages false for a list-grouped award', () => {
    expect(awardPageLinkForOrganizationName('Variety')).toEqual({
      slug: 'variety-top-100',
      hasYearPages: false,
    });
  });

  it('returns no slug for an organization without an award page', () => {
    expect(awardPageLinkForOrganizationName('Unknown Org')).toEqual({
      slug: undefined,
      hasYearPages: false,
    });
  });

  it('picks the page matching the category when an organization has several', () => {
    expect(
      awardPageLinkForOrganizationName('Kinema Junpo', 'Best Foreign Film'),
    ).toEqual({
      slug: 'kinema-junpo-foreign',
      hasYearPages: true,
    });
    expect(
      awardPageLinkForOrganizationName('Kinema Junpo', 'Best Japanese Film'),
    ).toEqual({
      slug: 'kinema-junpo-japanese',
      hasYearPages: true,
    });
  });

  it('returns no slug when the category of a multi-page organization is unknown', () => {
    expect(awardPageLinkForOrganizationName('Kinema Junpo')).toEqual({
      slug: undefined,
      hasYearPages: false,
    });
  });

  it('賞ページが1つの組織でも、そのページに属さないカテゴリには slug を返さない', () => {
    expect(
      awardPageLinkForOrganizationName('Japan Academy Awards', '監督賞'),
    ).toEqual({
      slug: undefined,
      hasYearPages: false,
    });
  });

  it('賞ページが1つの組織で、そのページのカテゴリなら slug を返す', () => {
    expect(
      awardPageLinkForOrganizationName('Japan Academy Awards', '優秀作品賞'),
    ).toEqual({
      slug: 'japan-academy-best-picture',
      hasYearPages: true,
    });
  });
});

describe('japaneseAwardNames', () => {
  it('組織名の日本語表記を返す', () => {
    expect(japaneseAwardNames('Venice Film Festival', 'Golden Lion')).toEqual({
      organization: 'ヴェネツィア国際映画祭',
      category: '金獅子賞',
    });
  });

  it('複数の賞ページを持つ組織はカテゴリで選ぶ', () => {
    expect(japaneseAwardNames('Kinema Junpo', 'Best Japanese Film')).toEqual({
      organization: 'キネマ旬報',
      category: '日本映画ベスト・テン',
    });
  });

  it('複数カテゴリを束ねるページではカテゴリ名を上書きしない', () => {
    expect(japaneseAwardNames('Japan Academy Awards', '優秀作品賞')).toEqual({
      organization: '日本アカデミー賞',
    });
  });

  it('賞ページの無い組織には何も返さない', () => {
    expect(japaneseAwardNames('Unknown Org', 'Unknown Category')).toEqual({});
  });

  it('賞ページに属さないカテゴリでは組織名だけ返す', () => {
    expect(japaneseAwardNames('Japan Academy Awards', '監督賞')).toEqual({
      organization: '日本アカデミー賞',
    });
  });

  it('部門名が英語の個人賞は部門名も日本語にする', () => {
    expect(
      japaneseAwardNames('Academy Awards', 'Academy Award for Best Director'),
    ).toEqual({
      organization: 'アカデミー賞',
      category: '監督賞',
    });
  });
});

describe('findPersonAwardDefinition', () => {
  it('アカデミー賞の監督賞を引く', () => {
    expect(
      findPersonAwardDefinition(
        'Academy Awards',
        'Academy Award for Best Director',
      )?.slug,
    ).toBe('academy-director');
  });

  it('アカデミー賞の助演女優賞を引く', () => {
    expect(
      findPersonAwardDefinition(
        'Academy Awards',
        'Academy Award for Best Supporting Actress',
      )?.slug,
    ).toBe('academy-supporting-actress');
  });

  it('日本アカデミー賞の監督賞を引く', () => {
    expect(
      findPersonAwardDefinition('Japan Academy Awards', '監督賞')?.slug,
    ).toBe('japan-academy-director');
  });

  it('カンヌ国際映画祭の女優賞を引く', () => {
    expect(
      findPersonAwardDefinition('Cannes Film Festival', 'Best Actress')?.slug,
    ).toBe('cannes-best-actress');
  });

  it('ヴェネツィア国際映画祭のヴォルピ杯女優賞を引く', () => {
    expect(
      findPersonAwardDefinition(
        'Venice Film Festival',
        'Volpi Cup for Best Actress',
      )?.slug,
    ).toBe('venice-best-actress');
  });

  it('ヴェネツィア国際映画祭の銀獅子賞を監督賞として引く', () => {
    expect(
      findPersonAwardDefinition(
        'Venice Film Festival',
        'Silver Lion for Best Director',
      )?.role,
    ).toBe('director');
  });
});

describe('AwardsService.getAwardYear', () => {
  let environment: Environment;
  let database: TestDatabase;
  let service: AwardsService;

  beforeEach(async () => {
    ({environment, database} = await createTestEnvironment());
    service = new AwardsService(environment);
  });

  async function seedThreeCannesYears(): Promise<void> {
    await seedCannes(database);
    await seedCannesCeremony(database, 'ceremony-2019', 2019, 72);
    await seedCannesCeremony(database, 'ceremony-2021', 2021, 74);
    await seedCannesCeremony(database, 'ceremony-2023', 2023, 76);
    await seedMovie(database, 'movie-a', 'A Nominee');
    await seedMovie(database, 'movie-b', 'B Winner');
    await seedMovie(database, 'movie-c', 'C Other Year');
    await seedMovie(database, 'movie-d', 'D Other Year');
    await database.insert(nominations).values([
      {
        movieUid: 'movie-a',
        ceremonyUid: 'ceremony-2021',
        categoryUid: 'cat-palme',
      },
      {
        movieUid: 'movie-b',
        ceremonyUid: 'ceremony-2021',
        categoryUid: 'cat-palme',
        isWinner: 1,
      },
      {
        movieUid: 'movie-c',
        ceremonyUid: 'ceremony-2019',
        categoryUid: 'cat-palme',
      },
      {
        movieUid: 'movie-d',
        ceremonyUid: 'ceremony-2023',
        categoryUid: 'cat-palme',
      },
    ]);
  }

  it('returns the requested year with the winner first', async () => {
    await seedThreeCannesYears();

    const result = await service.getAwardYear('palme-dor', 2021);

    expect(result).toMatchObject({
      slug: 'palme-dor',
      year: 2021,
      ceremonyNumber: 74,
    });
    expect(result?.movies.map(movie => movie.uid)).toEqual([
      'movie-b',
      'movie-a',
    ]);
  });

  it('returns the neighboring ceremony years across gaps', async () => {
    await seedThreeCannesYears();

    const result = await service.getAwardYear('palme-dor', 2021);

    expect(result?.previousYear).toBe(2019);
    expect(result?.nextYear).toBe(2023);
  });

  it('leaves neighbors undefined at the range edges', async () => {
    await seedThreeCannesYears();

    const oldest = await service.getAwardYear('palme-dor', 2019);
    const newest = await service.getAwardYear('palme-dor', 2023);

    expect(oldest?.previousYear).toBeUndefined();
    expect(oldest?.nextYear).toBe(2021);
    expect(newest?.previousYear).toBe(2021);
    expect(newest?.nextYear).toBeUndefined();
  });

  it('returns undefined for a year without a ceremony', async () => {
    await seedThreeCannesYears();

    const result = await service.getAwardYear('palme-dor', 2020);

    expect(result).toBeUndefined();
  });

  it('skips ceremony years without nominations in the category', async () => {
    await seedThreeCannesYears();
    await seedCannesCeremony(database, 'ceremony-2022', 2022, 75);

    const result = await service.getAwardYear('palme-dor', 2021);

    expect(result?.nextYear).toBe(2023);
  });

  it('returns undefined for a list-grouping award', async () => {
    await database.insert(awardOrganizations).values({
      uid: 'org-1001',
      name: '1001 Movies You Must See Before You Die',
    });
    await database.insert(awardCategories).values({
      uid: 'cat-1001',
      organizationUid: 'org-1001',
      name: 'Selected Films',
    });
    await database.insert(awardCeremonies).values({
      uid: 'ceremony-1001',
      organizationUid: 'org-1001',
      year: 2021,
    });
    await seedMovie(database, 'movie-a', 'Movie A');
    await database.insert(nominations).values({
      movieUid: 'movie-a',
      ceremonyUid: 'ceremony-1001',
      categoryUid: 'cat-1001',
    });

    const result = await service.getAwardYear('1001-movies', 2021);

    expect(result).toBeUndefined();
  });
});

async function seedJapanAcademyDirector(database: TestDatabase): Promise<void> {
  await database
    .insert(awardOrganizations)
    .values({uid: 'org-jaa', name: 'Japan Academy Awards'});
  await database.insert(awardCategories).values([
    {uid: 'cat-jaa-director', organizationUid: 'org-jaa', name: '監督賞'},
    {uid: 'cat-jaa-picture', organizationUid: 'org-jaa', name: '優秀作品賞'},
  ]);
  await database.insert(awardCeremonies).values([
    {
      uid: 'ceremony-jaa-1990',
      organizationUid: 'org-jaa',
      year: 1990,
      ceremonyNumber: 13,
    },
    {
      uid: 'ceremony-jaa-1994',
      organizationUid: 'org-jaa',
      year: 1994,
      ceremonyNumber: 17,
    },
  ]);
  await database.insert(people).values([
    {uid: 'person-master', tmdbId: 1, name: '巨匠'},
    {uid: 'person-young', tmdbId: 2, name: '若手', profilePath: '/young.jpg'},
    {uid: 'person-foreign', tmdbId: 3, name: 'John Woo'},
  ]);
  await database.insert(translations).values({
    resourceType: 'person_name',
    resourceUid: 'person-foreign',
    languageCode: 'ja',
    content: 'ジョン・ウー',
  });
  await seedMovie(database, 'movie-a', 'Movie A', {
    year: 1989,
    jaTitle: '映画A',
  });
  await seedMovie(database, 'movie-b', 'Movie B', {
    year: 1989,
    jaTitle: '映画B',
  });
  await seedMovie(database, 'movie-c', 'Movie C', {
    year: 1993,
    jaTitle: '映画C',
  });
  await seedMovie(database, 'movie-d', 'Movie D', {
    year: 1993,
    jaTitle: '映画D',
  });
  await database
    .insert(movies)
    .values({uid: 'movie-deleted', year: 1993, deletedAt: 1});
  await database.insert(nominations).values([
    {
      movieUid: 'movie-a',
      ceremonyUid: 'ceremony-jaa-1990',
      categoryUid: 'cat-jaa-director',
      personUid: 'person-master',
      isWinner: 1,
    },
    {
      movieUid: 'movie-b',
      ceremonyUid: 'ceremony-jaa-1990',
      categoryUid: 'cat-jaa-director',
      personUid: 'person-master',
      isWinner: 1,
    },
    {
      movieUid: 'movie-c',
      ceremonyUid: 'ceremony-jaa-1994',
      categoryUid: 'cat-jaa-director',
      personUid: 'person-master',
      isWinner: 0,
    },
    {
      movieUid: 'movie-d',
      ceremonyUid: 'ceremony-jaa-1994',
      categoryUid: 'cat-jaa-director',
      personUid: 'person-young',
      isWinner: 1,
    },
    {
      movieUid: 'movie-c',
      ceremonyUid: 'ceremony-jaa-1994',
      categoryUid: 'cat-jaa-director',
      personUid: 'person-foreign',
      isWinner: 0,
    },
    {
      movieUid: 'movie-deleted',
      ceremonyUid: 'ceremony-jaa-1994',
      categoryUid: 'cat-jaa-director',
      personUid: 'person-young',
      isWinner: 0,
    },
    {
      movieUid: 'movie-d',
      ceremonyUid: 'ceremony-jaa-1994',
      categoryUid: 'cat-jaa-picture',
      isWinner: 1,
    },
  ]);
}

describe('AwardsService.getPersonAwardBySlug', () => {
  let environment: Environment;
  let database: TestDatabase;
  let service: AwardsService;

  beforeEach(async () => {
    ({environment, database} = await createTestEnvironment());
    service = new AwardsService(environment);
    await seedJapanAcademyDirector(database);
  });

  it('grouping person で賞の名前を返す', async () => {
    const result = await service.getPersonAwardBySlug('japan-academy-director');

    expect(result).toMatchObject({
      slug: 'japan-academy-director',
      name: '最優秀監督賞',
      organization: '日本アカデミー賞',
      grouping: 'person',
    });
  });

  it('授賞式の年を新しい順に並べる', async () => {
    const result = await service.getPersonAwardBySlug('japan-academy-director');

    expect(result?.years.map(group => group.year)).toEqual([1994, 1990]);
  });

  it('回次を返す', async () => {
    const result = await service.getPersonAwardBySlug('japan-academy-director');

    expect(result?.years[0]?.ceremonyNumber).toBe(17);
  });

  it('受賞者を先頭に並べる', async () => {
    const result = await service.getPersonAwardBySlug('japan-academy-director');
    expect(result?.years[0]?.nominees.map(nominee => nominee.uid)).toEqual([
      'person-young',
      'person-foreign',
      'person-master',
    ]);
  });

  it('同じ授賞式で複数作品が紐づく受賞は1人にまとめる', async () => {
    const result = await service.getPersonAwardBySlug('japan-academy-director');
    expect(result?.years[1]?.nominees).toHaveLength(1);
    expect(
      result?.years[1]?.nominees[0]?.movies.map(movie => movie.title),
    ).toEqual(['映画A', '映画B']);
  });

  it('人物の日本語名を優先する', async () => {
    const result = await service.getPersonAwardBySlug('japan-academy-director');
    expect(
      result?.years[0]?.nominees.find(
        nominee => nominee.uid === 'person-foreign',
      ),
    ).toMatchObject({name: 'ジョン・ウー', originalName: 'John Woo'});
  });

  it('人物の写真を返す', async () => {
    const result = await service.getPersonAwardBySlug('japan-academy-director');
    expect(result?.years[0]?.nominees[0]?.profilePath).toBe('/young.jpg');
  });

  it('削除済み映画のノミネートは除く', async () => {
    const result = await service.getPersonAwardBySlug('japan-academy-director');
    expect(
      result?.years[0]?.nominees
        .find(nominee => nominee.uid === 'person-young')
        ?.movies.map(movie => movie.uid),
    ).toEqual(['movie-d']);
  });

  it('作品賞のノミネートは混ぜない', async () => {
    const result = await service.getPersonAwardBySlug('japan-academy-director');
    expect(result?.years[0]?.nominees).toHaveLength(3);
  });

  it('年ページは持たない', async () => {
    const result = await service.getAwardYear('japan-academy-director', 1994);

    expect(result).toBeUndefined();
  });
});

describe('AwardsService.listAwards 個人賞', () => {
  let environment: Environment;
  let database: TestDatabase;
  let service: AwardsService;

  beforeEach(async () => {
    ({environment, database} = await createTestEnvironment());
    service = new AwardsService(environment);
  });

  it('ノミネーションが無い個人賞は含めない', async () => {
    const result = await service.listAwards();

    expect(result.map(award => award.slug)).not.toContain(
      'japan-academy-director',
    );
  });

  it('個人賞を人数と年の範囲付きで含める', async () => {
    await seedJapanAcademyDirector(database);

    const result = await service.listAwards();

    expect(
      result.find(award => award.slug === 'japan-academy-director'),
    ).toMatchObject({
      grouping: 'person',
      personCount: 3,
      movieCount: 4,
      firstYear: 1990,
      lastYear: 1994,
    });
  });

  it('個人賞は作品賞の後に並べる', async () => {
    await seedJapanAcademyDirector(database);
    await seedCannes(database);
    await seedCannesCeremony(database, 'ceremony-2023', 2023);
    await database.insert(nominations).values({
      movieUid: 'movie-a',
      ceremonyUid: 'ceremony-2023',
      categoryUid: 'cat-palme',
    });

    const result = await service.listAwards();

    expect(result.map(award => award.slug)).toEqual([
      'palme-dor',
      'japan-academy-best-picture',
      'japan-academy-director',
    ]);
  });
});

describe('英国アカデミー賞の賞ページ', () => {
  it('作品賞は組織と部門から賞ページを引ける', () => {
    expect(
      awardPageLinkForOrganizationName(
        'British Academy Film Awards',
        'BAFTA Award for Best Film',
      ),
    ).toEqual({slug: 'bafta-best-film', hasYearPages: true});
  });

  it('個人賞5部門のページを定義している', () => {
    expect(
      personAwardDefinitions
        .filter(
          definition =>
            definition.organizationName === 'British Academy Film Awards',
        )
        .map(definition => [definition.slug, definition.categoryNames[0]]),
    ).toEqual([
      ['bafta-director', 'BAFTA Award for Best Direction'],
      ['bafta-lead-actor', 'BAFTA Award for Best Actor in a Leading Role'],
      ['bafta-lead-actress', 'BAFTA Award for Best Actress in a Leading Role'],
      [
        'bafta-supporting-actor',
        'BAFTA Award for Best Actor in a Supporting Role',
      ],
      [
        'bafta-supporting-actress',
        'BAFTA Award for Best Actress in a Supporting Role',
      ],
    ]);
  });
});

describe('ゴールデングローブ賞の賞ページ', () => {
  it('作品賞4部門は組織と部門から賞ページを引ける', () => {
    expect(
      [
        'Golden Globe Award for Best Motion Picture – Drama',
        'Golden Globe Award for Best Motion Picture – Musical or Comedy',
        'Golden Globe Award for Best Motion Picture – Non-English Language',
        'Golden Globe Award for Best Animated Feature Film',
      ].map(category =>
        awardPageLinkForOrganizationName('Golden Globe Awards', category),
      ),
    ).toEqual([
      {slug: 'golden-globe-drama', hasYearPages: true},
      {slug: 'golden-globe-musical-comedy', hasYearPages: true},
      {slug: 'golden-globe-non-english', hasYearPages: true},
      {slug: 'golden-globe-animated', hasYearPages: true},
    ]);
  });

  it('個人賞7部門のページを定義している', () => {
    expect(
      personAwardDefinitions
        .filter(
          definition => definition.organizationName === 'Golden Globe Awards',
        )
        .map(definition => [definition.slug, definition.categoryNames[0]]),
    ).toEqual([
      ['golden-globe-director', 'Golden Globe Award for Best Director'],
      [
        'golden-globe-lead-actor-drama',
        'Golden Globe Award for Best Actor in a Motion Picture – Drama',
      ],
      [
        'golden-globe-lead-actor-musical-comedy',
        'Golden Globe Award for Best Actor in a Motion Picture – Musical or Comedy',
      ],
      [
        'golden-globe-lead-actress-drama',
        'Golden Globe Award for Best Actress in a Motion Picture – Drama',
      ],
      [
        'golden-globe-lead-actress-musical-comedy',
        'Golden Globe Award for Best Actress in a Motion Picture – Musical or Comedy',
      ],
      [
        'golden-globe-supporting-actor',
        'Golden Globe Award for Best Supporting Actor – Motion Picture',
      ],
      [
        'golden-globe-supporting-actress',
        'Golden Globe Award for Best Supporting Actress – Motion Picture',
      ],
    ]);
  });
});
