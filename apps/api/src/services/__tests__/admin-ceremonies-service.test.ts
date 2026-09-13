import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {eq, getDatabase, type Environment} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {translations} from '@shine/database/schema/translations';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {beforeEach, describe, expect, it} from 'vitest';
import {AdminCeremoniesService} from '../admin-ceremonies-service';
import {ConflictError, NotFoundError, ValidationError} from '../errors';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../../packages/database/migrations',
);

type Database = ReturnType<typeof getDatabase>;

let environment: Environment;
let database: Database;
let service: AdminCeremoniesService;

beforeEach(async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-test-'));
  environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
  };
  database = getDatabase(environment);
  await migrate(database, {migrationsFolder});
  service = new AdminCeremoniesService(environment);
  await database
    .insert(awardOrganizations)
    .values({uid: 'org', name: 'Org', shortName: 'ORG', country: 'JP'});
  await database
    .insert(awardCategories)
    .values({uid: 'category', organizationUid: 'org', name: 'Best Film'});
});

async function seedCeremonies(): Promise<void> {
  await database.insert(awardCeremonies).values([
    {uid: 'c-2019', organizationUid: 'org', year: 2019, ceremonyNumber: 1},
    {uid: 'c-2020', organizationUid: 'org', year: 2020, ceremonyNumber: 2},
    {uid: 'c-2021', organizationUid: 'org', year: 2021, ceremonyNumber: 3},
  ]);
}

async function seedTitle(
  movieUid: string,
  languageCode: string,
  content: string,
  isOriginal = false,
): Promise<void> {
  await database.insert(translations).values({
    resourceType: 'movie_title',
    resourceUid: movieUid,
    languageCode,
    content,
    isDefault: isOriginal ? 1 : 0,
  });
}

describe('AdminCeremoniesService.listCeremonies', () => {
  it('counts distinct nominated movies per ceremony', async () => {
    await seedCeremonies();
    await database
      .insert(awardCategories)
      .values({uid: 'category-2', organizationUid: 'org', name: 'Director'});
    await database.insert(movies).values([
      {uid: 'movie-a', year: 2020},
      {uid: 'movie-b', year: 2020},
    ]);
    await database.insert(nominations).values([
      {movieUid: 'movie-a', ceremonyUid: 'c-2020', categoryUid: 'category'},
      {movieUid: 'movie-a', ceremonyUid: 'c-2020', categoryUid: 'category-2'},
      {movieUid: 'movie-b', ceremonyUid: 'c-2020', categoryUid: 'category'},
    ]);

    const ceremonies = await service.listCeremonies();

    expect(ceremonies.map(row => [row.uid, row.movieCount])).toEqual([
      ['c-2019', 0],
      ['c-2020', 2],
      ['c-2021', 0],
    ]);
  });

  it('includes the organization name and country', async () => {
    await seedCeremonies();

    const [first] = await service.listCeremonies();

    expect(first.organizationName).toBe('Org');
    expect(first.organizationCountry).toBe('JP');
  });
});

describe('AdminCeremoniesService.getCeremonyDetail', () => {
  it('throws NotFoundError for an unknown ceremony', async () => {
    await expect(service.getCeremonyDetail('missing')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('links previous and next ceremonies of the same organization', async () => {
    await seedCeremonies();

    const detail = await service.getCeremonyDetail('c-2020');

    expect(detail.navigation.previous).toEqual({
      uid: 'c-2019',
      year: 2019,
      ceremonyNumber: 1,
    });
    expect(detail.navigation.next).toEqual({
      uid: 'c-2021',
      year: 2021,
      ceremonyNumber: 3,
    });
  });

  it('omits ceremonyNumber in navigation when the sibling has none', async () => {
    await database.insert(awardCeremonies).values([
      {uid: 'c-2019', organizationUid: 'org', year: 2019},
      {uid: 'c-2020', organizationUid: 'org', year: 2020},
    ]);

    const detail = await service.getCeremonyDetail('c-2020');

    expect(detail.navigation.previous).toEqual({
      uid: 'c-2019',
      year: 2019,
      ceremonyNumber: undefined,
    });
  });

  it('leaves navigation empty for the only ceremony', async () => {
    await database
      .insert(awardCeremonies)
      .values({uid: 'c-only', organizationUid: 'org', year: 2020});

    const detail = await service.getCeremonyDetail('c-only');

    expect(detail.navigation).toEqual({previous: undefined, next: undefined});
  });

  it('prefers the default title over ja, original and en', async () => {
    await seedCeremonies();
    await database
      .insert(movies)
      .values({uid: 'movie-a', year: 2020, originalLanguage: 'fr'});
    await database.insert(nominations).values({
      uid: 'nom-a',
      movieUid: 'movie-a',
      ceremonyUid: 'c-2020',
      categoryUid: 'category',
      isWinner: 1,
    });
    await seedTitle('movie-a', 'en', 'English');
    await seedTitle('movie-a', 'ja', '日本語');
    await seedTitle('movie-a', 'fr', 'Français', true);

    const detail = await service.getCeremonyDetail('c-2020');

    expect(detail.nominations).toHaveLength(1);
    expect(detail.nominations[0]).toMatchObject({
      uid: 'nom-a',
      movie: {uid: 'movie-a', title: 'Français', year: 2020},
      category: {uid: 'category', name: 'Best Film'},
      isWinner: true,
    });
    expect(detail.nominations[0].specialMention).toBeNull();
  });

  it('falls back to ja, then the original language, then en', async () => {
    await seedCeremonies();
    await database.insert(movies).values([
      {uid: 'movie-ja', year: 2020, originalLanguage: 'fr'},
      {uid: 'movie-fr', year: 2020, originalLanguage: 'fr'},
      {uid: 'movie-en', year: 2020, originalLanguage: 'fr'},
    ]);
    await database.insert(nominations).values([
      {movieUid: 'movie-ja', ceremonyUid: 'c-2020', categoryUid: 'category'},
      {movieUid: 'movie-fr', ceremonyUid: 'c-2020', categoryUid: 'category'},
      {movieUid: 'movie-en', ceremonyUid: 'c-2020', categoryUid: 'category'},
    ]);
    await seedTitle('movie-ja', 'en', 'English');
    await seedTitle('movie-ja', 'fr', 'Français');
    await seedTitle('movie-ja', 'ja', '日本語');
    await seedTitle('movie-fr', 'en', 'English');
    await seedTitle('movie-fr', 'fr', 'Français');
    await seedTitle('movie-en', 'de', 'Deutsch');
    await seedTitle('movie-en', 'en', 'English');

    const detail = await service.getCeremonyDetail('c-2020');

    const titles = new Map(
      detail.nominations.map(row => [row.movie.uid, row.movie.title]),
    );
    expect(titles.get('movie-ja')).toBe('日本語');
    expect(titles.get('movie-fr')).toBe('Français');
    expect(titles.get('movie-en')).toBe('English');
  });

  it('returns an empty title when the movie has no title', async () => {
    await seedCeremonies();
    await database.insert(movies).values({uid: 'movie-a', year: 2020});
    await database.insert(nominations).values({
      movieUid: 'movie-a',
      ceremonyUid: 'c-2020',
      categoryUid: 'category',
    });

    const detail = await service.getCeremonyDetail('c-2020');

    expect(detail.nominations[0].movie.title).toBe('');
  });
});

describe('AdminCeremoniesService.createCeremony', () => {
  it('throws ValidationError when organizationUid is missing', async () => {
    await expect(service.createCeremony({year: 2020})).rejects.toThrow(
      new ValidationError('organizationUid is required'),
    );
  });

  it('throws ValidationError when year is out of range', async () => {
    await expect(
      service.createCeremony({organizationUid: 'org', year: 1800}),
    ).rejects.toThrow(
      new ValidationError('year must be a valid number (1880-9999)'),
    );
  });

  it('throws ValidationError when endDate is before startDate', async () => {
    await expect(
      service.createCeremony({
        organizationUid: 'org',
        year: 2020,
        startDate: '2020-03-02',
        endDate: '2020-03-01',
      }),
    ).rejects.toThrow(
      new ValidationError('endDate must be the same as or after startDate'),
    );
  });

  it('throws ValidationError when imdbEventUrl is not http(s)', async () => {
    await expect(
      service.createCeremony({
        organizationUid: 'org',
        year: 2020,
        imdbEventUrl: 'ftp://example.com',
      }),
    ).rejects.toThrow(
      new ValidationError('imdbEventUrl must be a valid http(s) URL'),
    );
  });

  it('throws NotFoundError when the organization does not exist', async () => {
    await expect(
      service.createCeremony({organizationUid: 'missing', year: 2020}),
    ).rejects.toThrow(new NotFoundError('Organization not found'));
  });

  it('throws ConflictError when the organization already has that year', async () => {
    await seedCeremonies();

    await expect(
      service.createCeremony({organizationUid: 'org', year: 2020}),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('throws ConflictError when the organization already has that number', async () => {
    await seedCeremonies();

    await expect(
      service.createCeremony({
        organizationUid: 'org',
        year: 2022,
        ceremonyNumber: 2,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('stores the parsed fields and returns the detail', async () => {
    const detail = await service.createCeremony({
      organizationUid: 'org',
      year: '2020',
      ceremonyNumber: '5',
      startDate: '2020-03-01T00:00:00Z',
      endDate: 1_583_100_000,
      location: ' <Tokyo> ',
      description: '',
      imdbEventUrl: 'https://www.imdb.com/event/ev0000003/2020/1/',
    });

    expect(detail.ceremony).toMatchObject({
      organizationUid: 'org',
      year: 2020,
      ceremonyNumber: 5,
      startDate: 1_583_020_800,
      endDate: 1_583_100_000,
      location: 'Tokyo',
      imdbEventUrl: 'https://www.imdb.com/event/ev0000003/2020/1/',
    });
    expect(detail.ceremony.description).toBeNull();
    expect(detail.nominations).toEqual([]);
  });
});

describe('AdminCeremoniesService.updateCeremony', () => {
  it('validates the body before checking the ceremony exists', async () => {
    await expect(
      service.updateCeremony('missing', {organizationUid: 'org'}),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws NotFoundError for an unknown ceremony', async () => {
    await expect(
      service.updateCeremony('missing', {organizationUid: 'org', year: 2020}),
    ).rejects.toThrow(new NotFoundError('Ceremony not found'));
  });

  it('does not treat the ceremony itself as a conflict', async () => {
    await seedCeremonies();

    const detail = await service.updateCeremony('c-2020', {
      organizationUid: 'org',
      year: 2020,
      ceremonyNumber: 2,
      location: 'Osaka',
    });

    expect(detail.ceremony.location).toBe('Osaka');
  });

  it('throws ConflictError when moving onto a sibling year', async () => {
    await seedCeremonies();

    await expect(
      service.updateCeremony('c-2020', {organizationUid: 'org', year: 2021}),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('updates updatedAt', async () => {
    await database.insert(awardCeremonies).values({
      uid: 'c-old',
      organizationUid: 'org',
      year: 2020,
      updatedAt: 1,
    });

    const detail = await service.updateCeremony('c-old', {
      organizationUid: 'org',
      year: 2020,
    });

    expect(detail.ceremony.updatedAt).toBeGreaterThan(1);
  });
});

describe('AdminCeremoniesService.deleteCeremony', () => {
  it('throws NotFoundError for an unknown ceremony', async () => {
    await expect(service.deleteCeremony('missing')).rejects.toThrow(
      new NotFoundError('Ceremony not found'),
    );
  });

  it('deletes the nominations together with the ceremony', async () => {
    await seedCeremonies();
    await database.insert(movies).values({uid: 'movie-a', year: 2020});
    await database.insert(nominations).values({
      movieUid: 'movie-a',
      ceremonyUid: 'c-2020',
      categoryUid: 'category',
    });

    await service.deleteCeremony('c-2020');

    const remainingCeremonies = await database
      .select({uid: awardCeremonies.uid})
      .from(awardCeremonies)
      .where(eq(awardCeremonies.uid, 'c-2020'));
    expect(remainingCeremonies).toHaveLength(0);
    const remainingNominations = await database.select().from(nominations);
    expect(remainingNominations).toHaveLength(0);
  });
});

describe('AdminCeremoniesService.getAwardsReference', () => {
  it('returns organizations, ceremonies and categories', async () => {
    await seedCeremonies();

    const reference = await service.getAwardsReference();

    expect(reference.organizations).toEqual([
      {uid: 'org', name: 'Org', country: 'JP'},
    ]);
    expect(reference.ceremonies.map(row => row.uid)).toEqual([
      'c-2019',
      'c-2020',
      'c-2021',
    ]);
    expect(reference.categories).toEqual([
      {
        uid: 'category',
        organizationUid: 'org',
        name: 'Best Film',
        organizationName: 'Org',
      },
    ]);
  });
});
