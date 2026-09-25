import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {eq, sql} from 'drizzle-orm';
import {migrate} from '@shine/database/testing';
import {beforeEach, describe, expect, it} from 'vitest';
import {getDatabase, type Environment} from '../index';
import {people} from '../schema/people';
import {translations} from '../schema/translations';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(currentDirectory, '../../migrations');
const searchIndexMigration = '0028_search_index';

type TestDatabase = ReturnType<typeof getDatabase>;

async function createTestDatabase(
  folder = migrationsFolder,
): Promise<TestDatabase> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-search-'));
  const environment: Environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder: folder});
  return database;
}

async function migrationsBeforeSearchIndex(): Promise<string> {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'shine-migrations-'),
  );
  await fs.cp(migrationsFolder, directory, {recursive: true});
  const journalPath = path.join(directory, 'meta', '_journal.json');
  const journal = JSON.parse(await fs.readFile(journalPath, 'utf8')) as {
    entries: Array<{tag: string}>;
  };
  const index = journal.entries.findIndex(
    entry => entry.tag === searchIndexMigration,
  );
  journal.entries = journal.entries.slice(0, index);
  await fs.writeFile(journalPath, JSON.stringify(journal));
  return directory;
}

async function peopleMatching(
  database: TestDatabase,
  phrase: string,
): Promise<string[]> {
  const rows = await database.all<{uid: string}>(sql`
		SELECT DISTINCT person_uid AS uid
		FROM person_search_entries
		WHERE id IN (
		  SELECT rowid FROM person_search WHERE person_search MATCH ${phrase}
		)
		ORDER BY person_uid
	`);
  return rows.map(row => row.uid);
}

async function moviesMatching(
  database: TestDatabase,
  phrase: string,
): Promise<string[]> {
  const rows = await database.all<{uid: string}>(sql`
		SELECT DISTINCT movie_uid AS uid
		FROM movie_search_entries
		WHERE id IN (
		  SELECT rowid FROM movie_search WHERE movie_search MATCH ${phrase}
		)
		ORDER BY movie_uid
	`);
  return rows.map(row => row.uid);
}

function personName(uid: string, personUid: string, content: string) {
  return {
    uid,
    resourceType: 'person_name' as const,
    resourceUid: personUid,
    languageCode: 'ja',
    content,
  };
}

function movieTitle(uid: string, movieUid: string, content: string) {
  return {
    uid,
    resourceType: 'movie_title' as const,
    resourceUid: movieUid,
    languageCode: 'ja',
    content,
  };
}

describe('人物の検索索引', () => {
  let database: TestDatabase;

  beforeEach(async () => {
    database = await createTestDatabase();
    await database
      .insert(people)
      .values({uid: 'person-yakusho', tmdbId: 1, name: '役所広司'});
  });

  it('人物を足すと名前の途中の2文字で引ける', async () => {
    expect(await peopleMatching(database, '"所広"')).toEqual([
      'person-yakusho',
    ]);
  });

  it('名前の連続した部分で引ける', async () => {
    expect(await peopleMatching(database, '"所広 広司"')).toEqual([
      'person-yakusho',
    ]);
  });

  it('名前に連続して現れない並びでは引けない', async () => {
    expect(await peopleMatching(database, '"役所 広司"')).toEqual([]);
  });

  it('名前を変えると新しい名前で引ける', async () => {
    await database
      .update(people)
      .set({name: '役所浩二'})
      .where(eq(people.uid, 'person-yakusho'));

    expect(await peopleMatching(database, '"浩二"')).toEqual([
      'person-yakusho',
    ]);
  });

  it('名前を変えると古い名前では引けない', async () => {
    await database
      .update(people)
      .set({name: '役所浩二'})
      .where(eq(people.uid, 'person-yakusho'));

    expect(await peopleMatching(database, '"広司"')).toEqual([]);
  });

  it('人物を消すと名前では引けない', async () => {
    await database.delete(people).where(eq(people.uid, 'person-yakusho'));

    expect(await peopleMatching(database, '"役所"')).toEqual([]);
  });

  it('訳した名前を足すと引ける', async () => {
    await database
      .insert(translations)
      .values(personName('t-yakusho-en', 'person-yakusho', 'Koji Yakusho'));

    expect(await peopleMatching(database, '"ya ak ku us sh ho"')).toEqual([
      'person-yakusho',
    ]);
  });

  it('人物を消しても訳した名前では引ける', async () => {
    await database
      .insert(translations)
      .values(personName('t-yakusho-en', 'person-yakusho', 'Koji Yakusho'));
    await database.delete(people).where(eq(people.uid, 'person-yakusho'));

    expect(await peopleMatching(database, '"ya ak ku"')).toEqual([
      'person-yakusho',
    ]);
  });

  it('訳した名前を変えると古い名前では引けない', async () => {
    await database
      .insert(translations)
      .values(personName('t-yakusho-en', 'person-yakusho', 'Koji Yakusho'));
    await database
      .update(translations)
      .set({content: 'K. Yakusho'})
      .where(eq(translations.uid, 't-yakusho-en'));

    expect(await peopleMatching(database, '"ko oj ji"')).toEqual([]);
  });

  it('訳した名前を消すと引けない', async () => {
    await database
      .insert(translations)
      .values(personName('t-yakusho-en', 'person-yakusho', 'Koji Yakusho'));
    await database
      .delete(translations)
      .where(eq(translations.uid, 't-yakusho-en'));

    expect(await peopleMatching(database, '"ya ak ku"')).toEqual([]);
  });

  it('英字の大文字小文字を区別しない', async () => {
    await database
      .insert(people)
      .values({uid: 'person-hanks', tmdbId: 2, name: 'Tom Hanks'});

    expect(await peopleMatching(database, '"HA AN"')).toEqual(['person-hanks']);
  });
});

describe('映画の検索索引', () => {
  let database: TestDatabase;

  beforeEach(async () => {
    database = await createTestDatabase();
    await database
      .insert(translations)
      .values(movieTitle('t-seven', 'movie-seven', '七人の侍'));
  });

  it('題名を足すと題名の途中の2文字で引ける', async () => {
    expect(await moviesMatching(database, '"の侍"')).toEqual(['movie-seven']);
  });

  it('題名を変えると新しい題名で引ける', async () => {
    await database
      .update(translations)
      .set({content: '七人の刺客'})
      .where(eq(translations.uid, 't-seven'));

    expect(await moviesMatching(database, '"刺客"')).toEqual(['movie-seven']);
  });

  it('題名を変えると古い題名では引けない', async () => {
    await database
      .update(translations)
      .set({content: '七人の刺客'})
      .where(eq(translations.uid, 't-seven'));

    expect(await moviesMatching(database, '"の侍"')).toEqual([]);
  });

  it('題名を消すと引けない', async () => {
    await database.delete(translations).where(eq(translations.uid, 't-seven'));

    expect(await moviesMatching(database, '"七人"')).toEqual([]);
  });

  it('題名を別の映画に付け替えると付け替え先で引ける', async () => {
    await database
      .update(translations)
      .set({resourceUid: 'movie-merged'})
      .where(eq(translations.uid, 't-seven'));

    expect(await moviesMatching(database, '"七人"')).toEqual(['movie-merged']);
  });

  it('1文字の題名はその1文字で引ける', async () => {
    await database
      .insert(translations)
      .values(movieTitle('t-ran', 'movie-ran', '乱'));

    expect(await moviesMatching(database, '"乱"')).toEqual(['movie-ran']);
  });

  it('映画の説明は索引に入れない', async () => {
    await database.insert(translations).values({
      uid: 't-seven-description',
      resourceType: 'movie_description',
      resourceUid: 'movie-seven',
      languageCode: 'ja',
      content: '野武士と戦う',
    });

    expect(await moviesMatching(database, '"野武"')).toEqual([]);
  });

  it('人名は映画の索引に入れない', async () => {
    await database
      .insert(translations)
      .values(personName('t-kurosawa', 'person-kurosawa', '黒澤明'));

    expect(await moviesMatching(database, '"黒澤"')).toEqual([]);
  });
});

describe('検索索引のバックフィル', () => {
  let database: TestDatabase;

  beforeEach(async () => {
    database = await createTestDatabase(await migrationsBeforeSearchIndex());
    await database
      .insert(people)
      .values({uid: 'person-kurosawa', tmdbId: 1, name: '黒澤明'});
    await database
      .insert(translations)
      .values([
        personName('t-scorsese', 'person-scorsese', 'マーティン・スコセッシ'),
        movieTitle('t-seven', 'movie-seven', '七人の侍'),
      ]);
    await migrate(database, {migrationsFolder});
  });

  it('既存の人物の名前で引ける', async () => {
    expect(await peopleMatching(database, '"黒澤 澤明"')).toEqual([
      'person-kurosawa',
    ]);
  });

  it('既存の訳した人名で引ける', async () => {
    expect(await peopleMatching(database, '"スコ コセ"')).toEqual([
      'person-scorsese',
    ]);
  });

  it('既存の題名で引ける', async () => {
    expect(await moviesMatching(database, '"人の の侍"')).toEqual([
      'movie-seven',
    ]);
  });

  it('既存の行も更新すると古い値では引けない', async () => {
    await database
      .update(people)
      .set({name: '黒沢明'})
      .where(eq(people.uid, 'person-kurosawa'));

    expect(await peopleMatching(database, '"黒澤"')).toEqual([]);
  });
});
