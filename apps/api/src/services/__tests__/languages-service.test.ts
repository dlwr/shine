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
import {translations} from '@shine/database/schema/translations';
import {migrate} from '@shine/database/testing';
import {beforeEach, describe, expect, it} from 'vitest';
import {LanguagesService} from '../languages-service';

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
    path.join(os.tmpdir(), 'shine-languages-'),
  );
  const environment: Environment = {
    DATABASE_FILE_URL: `file:${path.join(directory, 'test.db')}`,
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});
  await database
    .insert(awardOrganizations)
    .values({uid: 'org-cannes', name: 'Cannes Film Festival'});
  await database.insert(awardCategories).values({
    uid: 'cat-palme',
    organizationUid: 'org-cannes',
    name: "Palme d'Or",
  });
  await database.insert(awardCeremonies).values({
    uid: 'ceremony-cannes',
    organizationUid: 'org-cannes',
    year: 2019,
  });
  return {environment, database};
}

async function seedMovie(
  database: TestDatabase,
  uid: string,
  options: {
    language: string;
    year?: number;
    nominated?: boolean;
    deleted?: boolean;
  },
): Promise<void> {
  await database.insert(movies).values({
    uid,
    originalLanguage: options.language,
    year: options.year,
    deletedAt: options.deleted ? 1_700_000_000 : undefined,
  });
  await database.insert(translations).values({
    resourceType: 'movie_title',
    resourceUid: uid,
    languageCode: 'en',
    content: `${uid} title`,
    isDefault: 1,
  });
  if (options.nominated ?? true) {
    await database.insert(nominations).values({
      movieUid: uid,
      ceremonyUid: 'ceremony-cannes',
      categoryUid: 'cat-palme',
    });
  }
}

describe('LanguagesService', () => {
  let service: LanguagesService;
  let database: TestDatabase;

  beforeEach(async () => {
    const created = await createTestEnvironment();
    database = created.database;
    service = new LanguagesService(created.environment);
  });

  describe('listLanguages', () => {
    it('賞に選ばれた映画の本数が多い言語から並べる', async () => {
      await seedMovie(database, 'fa-1', {language: 'fa'});
      await seedMovie(database, 'ja-1', {language: 'ja'});
      await seedMovie(database, 'ja-2', {language: 'ja'});
      await seedMovie(database, 'ja-3', {language: 'ja'});
      await seedMovie(database, 'ko-1', {language: 'ko'});
      await seedMovie(database, 'ko-2', {language: 'ko'});

      const languages = await service.listLanguages();

      expect(languages).toEqual([
        {code: 'ja', movieCount: 3},
        {code: 'ko', movieCount: 2},
        {code: 'fa', movieCount: 1},
      ]);
    });

    it('賞に選ばれていない映画は数えない', async () => {
      await seedMovie(database, 'ja-1', {language: 'ja'});
      await seedMovie(database, 'fa-1', {language: 'fa', nominated: false});

      const languages = await service.listLanguages();

      expect(languages.map(language => language.code)).toEqual(['ja']);
    });

    it('削除された映画は数えない', async () => {
      await seedMovie(database, 'ja-1', {language: 'ja'});
      await seedMovie(database, 'fa-1', {language: 'fa', deleted: true});

      const languages = await service.listLanguages();

      expect(languages.map(language => language.code)).toEqual(['ja']);
    });
  });

  describe('getLanguageMovies', () => {
    it('その言語の映画を新しい年から並べる', async () => {
      await seedMovie(database, 'fa-1997', {language: 'fa', year: 1997});
      await seedMovie(database, 'fa-2011', {language: 'fa', year: 2011});
      await seedMovie(database, 'fa-1990', {language: 'fa', year: 1990});
      await seedMovie(database, 'ja-2000', {language: 'ja', year: 2000});

      const result = await service.getLanguageMovies('fa');

      expect(result.map(movie => movie.uid)).toEqual([
        'fa-2011',
        'fa-1997',
        'fa-1990',
      ]);
    });
  });
});
