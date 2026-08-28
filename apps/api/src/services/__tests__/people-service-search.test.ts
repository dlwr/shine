import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movieCredits} from '@shine/database/schema/movie-credits';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {people} from '@shine/database/schema/people';
import {translations} from '@shine/database/schema/translations';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {beforeEach, describe, expect, it} from 'vitest';
import {PeopleService} from '../people-service';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../../packages/database/migrations',
);

async function createTestEnvironment(): Promise<Environment> {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'shine-people-search-'),
  );
  const environment: Environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});

  await database.insert(awardOrganizations).values([
    {uid: 'org-japan-academy', name: 'Japan Academy Awards'},
    {uid: 'org-academy', name: 'Academy Awards'},
  ]);
  await database.insert(awardCategories).values([
    {uid: 'cat-director', organizationUid: 'org-japan-academy', name: '監督賞'},
    {
      uid: 'cat-lead-actor',
      organizationUid: 'org-japan-academy',
      name: '主演男優賞',
    },
    {
      uid: 'cat-best-picture',
      organizationUid: 'org-academy',
      name: 'Academy Award for Best Picture',
    },
  ]);
  await database.insert(awardCeremonies).values([
    {uid: 'ceremony-1990', organizationUid: 'org-japan-academy', year: 1990},
    {uid: 'ceremony-1991', organizationUid: 'org-japan-academy', year: 1991},
    {uid: 'ceremony-1992', organizationUid: 'org-japan-academy', year: 1992},
    {uid: 'ceremony-academy', organizationUid: 'org-academy', year: 1990},
  ]);

  await database.insert(movies).values([
    {uid: 'movie-a', year: 1989},
    {uid: 'movie-b', year: 1990},
    {uid: 'movie-c', year: 1991},
    {uid: 'movie-deleted', year: 2015, deletedAt: 1_700_000_000},
  ]);
  await database.insert(translations).values([
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-a',
      languageCode: 'ja',
      content: '作品A',
      isDefault: 1,
    },
    {
      resourceType: 'movie_title',
      resourceUid: 'movie-b',
      languageCode: 'ja',
      content: '作品B',
      isDefault: 1,
    },
    {
      resourceType: 'person_name',
      resourceUid: 'person-streep',
      languageCode: 'ja',
      content: 'メリル・ストリープ',
      isDefault: 0,
    },
  ]);

  await database.insert(people).values([
    {uid: 'person-yakusho', tmdbId: 1, name: '役所広司', profilePath: '/y.jpg'},
    {uid: 'person-saburo', tmdbId: 2, name: '役者三郎'},
    {uid: 'person-shiro', tmdbId: 3, name: '役者四郎'},
    {uid: 'person-taro', tmdbId: 4, name: '役者太郎'},
    {uid: 'person-jiro', tmdbId: 5, name: '役者次郎'},
    {uid: 'person-deleted', tmdbId: 6, name: '役所削除'},
    {uid: 'person-streep', tmdbId: 7, name: 'Meryl Streep'},
    {uid: 'person-other', tmdbId: 8, name: '薬師丸ひろ子'},
  ]);

  await database
    .insert(movieCredits)
    .values([
      credit('c-yakusho-a', 'movie-a', 'person-yakusho'),
      credit('c-yakusho-b', 'movie-b', 'person-yakusho'),
      credit('c-yakusho-c', 'movie-c', 'person-yakusho'),
      credit('c-saburo-a', 'movie-a', 'person-saburo'),
      credit('c-shiro-a', 'movie-a', 'person-shiro'),
      credit('c-shiro-b', 'movie-b', 'person-shiro'),
      credit('c-shiro-c', 'movie-c', 'person-shiro'),
      credit('c-taro-a', 'movie-a', 'person-taro'),
      credit('c-taro-b', 'movie-b', 'person-taro'),
      credit('c-jiro-a', 'movie-a', 'person-jiro'),
      credit('c-deleted', 'movie-deleted', 'person-deleted'),
      credit('c-streep-b', 'movie-b', 'person-streep'),
      credit('c-other-a', 'movie-a', 'person-other'),
    ]);

  await database
    .insert(nominations)
    .values([
      nomination(
        'movie-a',
        'ceremony-1990',
        'cat-lead-actor',
        'person-yakusho',
        true,
      ),
      nomination(
        'movie-b',
        'ceremony-1991',
        'cat-lead-actor',
        'person-yakusho',
        true,
      ),
      nomination(
        'movie-c',
        'ceremony-1992',
        'cat-lead-actor',
        'person-yakusho',
        false,
      ),
      nomination(
        'movie-a',
        'ceremony-1990',
        'cat-director',
        'person-saburo',
        true,
      ),
      nomination(
        'movie-a',
        'ceremony-1990',
        'cat-director',
        'person-shiro',
        true,
      ),
      nomination(
        'movie-b',
        'ceremony-1991',
        'cat-director',
        'person-shiro',
        true,
      ),
      nomination(
        'movie-c',
        'ceremony-1992',
        'cat-director',
        'person-shiro',
        true,
      ),
      nomination(
        'movie-a',
        'ceremony-academy',
        'cat-best-picture',
        'person-taro',
        true,
      ),
      nomination(
        'movie-deleted',
        'ceremony-1990',
        'cat-director',
        'person-deleted',
        true,
      ),
      nomination(
        'movie-b',
        'ceremony-1992',
        'cat-lead-actor',
        'person-streep',
        false,
      ),
    ]);

  return environment;
}

function credit(creditId: string, movieUid: string, personUid: string) {
  return {
    creditId,
    movieUid,
    personUid,
    department: 'Acting',
    castOrder: 0,
  };
}

function nomination(
  movieUid: string,
  ceremonyUid: string,
  categoryUid: string,
  personUid: string,
  isWinner: boolean,
) {
  return {
    movieUid,
    ceremonyUid,
    categoryUid,
    personUid,
    isWinner: isWinner ? 1 : 0,
  };
}

describe('PeopleService.searchPeople', () => {
  let service: PeopleService;

  beforeEach(async () => {
    service = new PeopleService(await createTestEnvironment());
  });

  it('名前の部分一致で人物を返す', async () => {
    const result = await service.searchPeople({query: '役所', locale: 'ja'});

    expect(result.map(person => person.name)).toEqual(['役所広司', '役所削除']);
  });

  it('翻訳された名前でも一致する', async () => {
    const result = await service.searchPeople({
      query: 'ストリープ',
      locale: 'ja',
    });

    expect(result.map(person => person.uid)).toEqual(['person-streep']);
  });

  it('個人賞の受賞回数が多い順に並べる', async () => {
    const result = await service.searchPeople({query: '役', locale: 'ja'});

    expect(result.slice(0, 3).map(person => person.name)).toEqual([
      '役者四郎',
      '役所広司',
      '役者三郎',
    ]);
  });

  it('受賞の無い人物は参加作品数が多い順に続ける', async () => {
    const result = await service.searchPeople({query: '役', locale: 'ja'});

    expect(result.slice(3).map(person => person.name)).toEqual([
      '役者太郎',
      '役者次郎',
      '役所削除',
    ]);
  });

  it('受賞回数を数える', async () => {
    const [person] = await service.searchPeople({
      query: '役所広司',
      locale: 'ja',
    });

    expect(person.wonCount).toBe(2);
  });

  it('ノミネート回数を数える', async () => {
    const [person] = await service.searchPeople({
      query: '役所広司',
      locale: 'ja',
    });

    expect(person.nominatedCount).toBe(3);
  });

  it('作品賞のノミネーションは数えない', async () => {
    const [person] = await service.searchPeople({
      query: '役者太郎',
      locale: 'ja',
    });

    expect(person.nominatedCount).toBe(0);
  });

  it('削除済み映画の受賞は数えない', async () => {
    const [person] = await service.searchPeople({
      query: '役所削除',
      locale: 'ja',
    });

    expect(person.wonCount).toBe(0);
  });

  it('locale が ja なら日本語名を返す', async () => {
    const [person] = await service.searchPeople({
      query: 'Streep',
      locale: 'ja',
    });

    expect(person.name).toBe('メリル・ストリープ');
  });

  it('locale が en なら原語名を返す', async () => {
    const [person] = await service.searchPeople({
      query: 'Streep',
      locale: 'en',
    });

    expect(person.name).toBe('Meryl Streep');
  });

  it('写真を返す', async () => {
    const [person] = await service.searchPeople({
      query: '役所広司',
      locale: 'ja',
    });

    expect(person.profilePath).toBe('/y.jpg');
  });

  it('代表作は受賞作を新しい年から並べる', async () => {
    const [person] = await service.searchPeople({
      query: '役所広司',
      locale: 'ja',
    });

    expect(person.topMovies.map(movie => movie.title)).toEqual([
      '作品B',
      '作品A',
    ]);
  });

  it('limit で人数を絞る', async () => {
    const result = await service.searchPeople({
      query: '役',
      locale: 'ja',
      limit: 2,
    });

    expect(result).toHaveLength(2);
  });

  it('LIKE のワイルドカードは文字として扱う', async () => {
    const result = await service.searchPeople({query: '%', locale: 'ja'});

    expect(result).toEqual([]);
  });
});
