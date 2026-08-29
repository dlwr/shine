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
import {translations} from '@shine/database/schema/translations';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {beforeEach, describe, expect, it} from 'vitest';
import {YearsService} from '../years-service';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../../packages/database/migrations',
);

type TestDatabase = ReturnType<typeof getDatabase>;

async function createTestEnvironment(): Promise<Environment> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-years-'));
  const environment: Environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
  };
  const database: TestDatabase = getDatabase(environment);
  await migrate(database, {migrationsFolder});

  await database.insert(awardOrganizations).values([
    {uid: 'org-cannes', name: 'Cannes Film Festival'},
    {uid: 'org-japan', name: 'Japan Academy Awards'},
  ]);
  await database.insert(awardCategories).values([
    {uid: 'cat-palme', organizationUid: 'org-cannes', name: "Palme d'Or"},
    {uid: 'cat-grand-prix', organizationUid: 'org-cannes', name: 'Grand Prix'},
    {uid: 'cat-director', organizationUid: 'org-japan', name: '監督賞'},
  ]);
  await database.insert(awardCeremonies).values([
    {uid: 'ceremony-cannes', organizationUid: 'org-cannes', year: 1980},
    {uid: 'ceremony-cannes-1981', organizationUid: 'org-cannes', year: 1981},
    {uid: 'ceremony-japan', organizationUid: 'org-japan', year: 1986},
  ]);
  await database.insert(movies).values([
    {uid: 'movie-palme', year: 1980},
    {uid: 'movie-grand-prix-only', year: 1981},
    {uid: 'movie-director-only', year: 1985},
  ]);
  await database.insert(translations).values([
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-palme',
      languageCode: 'ja',
      content: '影武者',
      isDefault: 1,
    },
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-director-only',
      languageCode: 'ja',
      content: '監督賞だけの映画',
      isDefault: 1,
    },
  ]);
  await database.insert(people).values({
    uid: 'person-a',
    tmdbId: 1,
    name: '監督A',
  });
  await database.insert(nominations).values([
    {
      movieUid: 'movie-palme',
      ceremonyUid: 'ceremony-cannes',
      categoryUid: 'cat-palme',
      isWinner: 1,
    },
    {
      movieUid: 'movie-grand-prix-only',
      ceremonyUid: 'ceremony-cannes-1981',
      categoryUid: 'cat-grand-prix',
      isWinner: 1,
    },
    {
      movieUid: 'movie-director-only',
      ceremonyUid: 'ceremony-japan',
      categoryUid: 'cat-director',
      personUid: 'person-a',
      isWinner: 1,
    },
  ]);

  return environment;
}

describe('YearsService', () => {
  let environment: Environment;

  beforeEach(async () => {
    environment = await createTestEnvironment();
  });

  it('賞ページのある年を返す', async () => {
    const service = new YearsService(environment);

    const years = await service.listYears();

    expect(years.map(year => year.year)).toEqual([1980]);
  });

  it('個人賞しか無い映画は年の集計に数えない', async () => {
    const service = new YearsService(environment);

    const years = await service.listYears();

    expect(years.find(year => year.year === 1985)).toBeUndefined();
  });

  it('賞ページのある映画を年別に返す', async () => {
    const service = new YearsService(environment);

    const detail = await service.getYear(1980);

    expect(detail?.movies.map(movie => movie.uid)).toEqual(['movie-palme']);
  });

  it('賞ページのある映画に賞のタグを付ける', async () => {
    const service = new YearsService(environment);

    const detail = await service.getYear(1980);

    expect(detail?.movies[0].awards).toEqual([
      {slug: 'palme-dor', isWinner: true},
    ]);
  });

  it('個人賞しか無い映画は年別ページに出さない', async () => {
    const service = new YearsService(environment);

    const detail = await service.getYear(1985);

    expect(detail).toBeUndefined();
  });

  it('映画祭のサブ賞しか無い映画は年の集計に数えない', async () => {
    const service = new YearsService(environment);

    const years = await service.listYears();

    expect(years.find(year => year.year === 1981)).toBeUndefined();
  });

  it('映画祭のサブ賞しか無い映画は年別ページに出さない', async () => {
    const service = new YearsService(environment);

    const detail = await service.getYear(1981);

    expect(detail).toBeUndefined();
  });
});
