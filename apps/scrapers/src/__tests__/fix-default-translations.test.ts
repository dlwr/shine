import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {and, eq} from 'drizzle-orm';
import {getDatabase, type Environment} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {translations} from '@shine/database/schema/translations';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {afterEach, describe, expect, it} from 'vitest';
import {fixDefaultTranslations} from '../fix-default-translations';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

type TestDatabase = ReturnType<typeof getDatabase>;

let temporaryDirectories: string[] = [];

async function createTestDatabase(): Promise<TestDatabase> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-default-'));
  temporaryDirectories.push(directory);
  const environment: Environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});
  return database;
}

async function seedMovie(
  database: TestDatabase,
  values: {
    uid: string;
    originalLanguage: string;
    deleted?: boolean;
    titles: Array<{languageCode: string; isDefault: number}>;
    descriptions?: Array<{languageCode: string; isDefault: number}>;
  },
): Promise<void> {
  await database.insert(movies).values({
    uid: values.uid,
    originalLanguage: values.originalLanguage,
    year: 2020,
    deletedAt: values.deleted ? 1_700_000_000 : undefined,
  });
  await database.insert(translations).values([
    ...values.titles.map(title => ({
      resourceType: 'movie_title' as const,
      resourceUid: values.uid,
      languageCode: title.languageCode,
      content: `${title.languageCode} title`,
      isDefault: title.isDefault,
    })),
    ...(values.descriptions ?? []).map(description => ({
      resourceType: 'movie_description' as const,
      resourceUid: values.uid,
      languageCode: description.languageCode,
      content: `${description.languageCode} description`,
      isDefault: description.isDefault,
    })),
  ]);
}

async function flagsOf(
  database: TestDatabase,
  movieUid: string,
  resourceType: 'movie_title' | 'movie_description',
): Promise<Map<string, number | null>> {
  const rows = await database
    .select()
    .from(translations)
    .where(
      and(
        eq(translations.resourceUid, movieUid),
        eq(translations.resourceType, resourceType),
      ),
    );
  return new Map(rows.map(row => [row.languageCode, row.isDefault]));
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.map(async directory =>
      fs.rm(directory, {recursive: true, force: true}),
    ),
  );
  temporaryDirectories = [];
});

describe('fixDefaultTranslations', () => {
  it('原語のタイトル行をデフォルトにし、他の行のデフォルトを外す', async () => {
    const database = await createTestDatabase();
    await seedMovie(database, {
      uid: 'kokuho',
      originalLanguage: 'ja',
      titles: [
        {languageCode: 'en', isDefault: 1},
        {languageCode: 'ja', isDefault: 0},
      ],
    });

    const result = await fixDefaultTranslations({database, isDryRun: false});

    const flags = await flagsOf(database, 'kokuho', 'movie_title');
    expect(flags.get('ja')).toBe(1);
    expect(flags.get('en')).toBe(0);
    expect(result.updated).toBe(2);
  });

  it('説明文も原語の行をデフォルトにする', async () => {
    const database = await createTestDatabase();
    await seedMovie(database, {
      uid: 'kokuho',
      originalLanguage: 'ja',
      titles: [{languageCode: 'ja', isDefault: 1}],
      descriptions: [
        {languageCode: 'en', isDefault: 1},
        {languageCode: 'ja', isDefault: 0},
      ],
    });

    await fixDefaultTranslations({database, isDryRun: false});

    const flags = await flagsOf(database, 'kokuho', 'movie_description');
    expect(flags.get('ja')).toBe(1);
    expect(flags.get('en')).toBe(0);
  });

  it('原語の行が無ければ何も変えない', async () => {
    const database = await createTestDatabase();
    await seedMovie(database, {
      uid: 'french',
      originalLanguage: 'fr',
      titles: [
        {languageCode: 'en', isDefault: 1},
        {languageCode: 'ja', isDefault: 0},
      ],
    });

    const result = await fixDefaultTranslations({database, isDryRun: false});

    const flags = await flagsOf(database, 'french', 'movie_title');
    expect(flags.get('en')).toBe(1);
    expect(flags.get('ja')).toBe(0);
    expect(result.updated).toBe(0);
  });

  it('既に正しい映画は書き換えない', async () => {
    const database = await createTestDatabase();
    await seedMovie(database, {
      uid: 'correct',
      originalLanguage: 'ja',
      titles: [
        {languageCode: 'en', isDefault: 0},
        {languageCode: 'ja', isDefault: 1},
      ],
    });

    const result = await fixDefaultTranslations({database, isDryRun: false});

    expect(result.updated).toBe(0);
  });

  it('soft-deleteされた映画は対象にしない', async () => {
    const database = await createTestDatabase();
    await seedMovie(database, {
      uid: 'deleted',
      originalLanguage: 'ja',
      deleted: true,
      titles: [
        {languageCode: 'en', isDefault: 1},
        {languageCode: 'ja', isDefault: 0},
      ],
    });

    const result = await fixDefaultTranslations({database, isDryRun: false});

    const flags = await flagsOf(database, 'deleted', 'movie_title');
    expect(flags.get('en')).toBe(1);
    expect(result.updated).toBe(0);
  });

  it('dry-runでは書き込まない', async () => {
    const database = await createTestDatabase();
    await seedMovie(database, {
      uid: 'kokuho',
      originalLanguage: 'ja',
      titles: [
        {languageCode: 'en', isDefault: 1},
        {languageCode: 'ja', isDefault: 0},
      ],
    });
    const result = await fixDefaultTranslations({database, isDryRun: true});

    const flags = await flagsOf(database, 'kokuho', 'movie_title');
    expect(flags.get('en')).toBe(1);
    expect(result.updated).toBe(2);
  });
});
