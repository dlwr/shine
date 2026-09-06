import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {people} from '@shine/database/schema/people';
import {translations} from '@shine/database/schema/translations';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {afterEach, describe, expect, it} from 'vitest';
import {getScrapeDatabase} from '../common/dry-run';
import {backfillPersonEnglishNames} from '../person-english-names';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

let temporaryDirectories: string[] = [];
const temporaryEnvironments = new WeakMap<object, Environment>();

async function createTestDatabase() {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'shine-person-english-names-'),
  );
  temporaryDirectories.push(directory);
  const environment: Environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});
  temporaryEnvironments.set(database, environment);
  await database.insert(people).values([
    {uid: 'person-szor', tmdbId: 4_487_240, name: 'רחל שור'},
    {uid: 'person-song', tmdbId: 20_738, name: '송강호'},
    {uid: 'person-koreeda', tmdbId: 608, name: '是枝裕和'},
    {uid: 'person-scorsese', tmdbId: 1032, name: 'Martin Scorsese'},
  ]);
  await database.insert(translations).values({
    resourceType: 'person_name',
    resourceUid: 'person-song',
    languageCode: 'en',
    content: 'Song Kang-ho',
  });
  return database;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.map(async directory =>
      fs.rm(directory, {recursive: true, force: true}),
    ),
  );
  temporaryDirectories = [];
});

function englishNames(names: Record<number, string | undefined>) {
  const requested: number[] = [];
  return {
    requested,
    async fetchEnglishName(tmdbId: number) {
      requested.push(tmdbId);
      return names[tmdbId];
    },
  };
}

async function englishRows(database: ReturnType<typeof getDatabase>) {
  const rows = await database.select().from(translations);
  return rows
    .filter(row => row.languageCode === 'en')
    .map(row => [row.resourceUid, row.content]);
}

describe('backfillPersonEnglishNames', () => {
  it('原語がラテン文字でも日本語でもなく、英語名の無い人物だけを引く', async () => {
    const database = await createTestDatabase();
    const source = englishNames({4_487_240: 'Rachel Szor'});

    await backfillPersonEnglishNames({
      database,
      isDryRun: false,
      fetchEnglishName: source.fetchEnglishName,
    });

    expect(source.requested).toEqual([4_487_240]);
  });

  it('英語名を en の person_name に保存する', async () => {
    const database = await createTestDatabase();
    const source = englishNames({4_487_240: 'Rachel Szor'});

    await backfillPersonEnglishNames({
      database,
      isDryRun: false,
      fetchEnglishName: source.fetchEnglishName,
    });

    expect(await englishRows(database)).toEqual([
      ['person-song', 'Song Kang-ho'],
      ['person-szor', 'Rachel Szor'],
    ]);
  });

  it('英語名が原語と同じか、ラテン文字でなければ保存しない', async () => {
    const database = await createTestDatabase();
    const source = englishNames({4_487_240: 'רחל שור'});

    const stats = await backfillPersonEnglishNames({
      database,
      isDryRun: false,
      fetchEnglishName: source.fetchEnglishName,
    });

    expect(await englishRows(database)).toEqual([
      ['person-song', 'Song Kang-ho'],
    ]);
    expect(stats.skipped).toBe(1);
  });

  it('英語名が取れなければ失敗に数える', async () => {
    const database = await createTestDatabase();
    const source = englishNames({});

    const stats = await backfillPersonEnglishNames({
      database,
      isDryRun: false,
      fetchEnglishName: source.fetchEnglishName,
    });

    expect(stats).toMatchObject({candidates: 1, saved: 0, failed: 1});
  });

  it('dry-run では保存しない', async () => {
    const database = await createTestDatabase();
    const source = englishNames({4_487_240: 'Rachel Szor'});

    const environment = temporaryEnvironments.get(database)!;

    const stats = await backfillPersonEnglishNames({
      database: getScrapeDatabase({environment, isDryRun: true}),
      isDryRun: true,
      fetchEnglishName: source.fetchEnglishName,
    });

    expect(await englishRows(database)).toEqual([
      ['person-song', 'Song Kang-ho'],
    ]);
    expect(stats.saved).toBe(1);
  });

  it('limit で件数を絞る', async () => {
    const database = await createTestDatabase();
    await database
      .insert(people)
      .values({uid: 'person-extra', tmdbId: 65_893, name: 'Άννα Κυριακού'});
    const source = englishNames({
      4_487_240: 'Rachel Szor',
      65_893: 'Anna Kyriakou',
    });

    await backfillPersonEnglishNames({
      database,
      isDryRun: false,
      fetchEnglishName: source.fetchEnglishName,
      limit: 1,
    });

    expect(source.requested).toHaveLength(1);
  });
});
