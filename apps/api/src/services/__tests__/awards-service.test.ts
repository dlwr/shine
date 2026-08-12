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
import {
  AwardsService,
  awardPageLinkForOrganizationName,
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
    expect(yearGroup?.movies).toHaveLength(2);
    expect(yearGroup?.movies[0]).toMatchObject({
      uid: 'movie-winner',
      isWinner: true,
    });
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
