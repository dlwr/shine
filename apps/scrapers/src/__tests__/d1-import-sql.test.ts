import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createClient, type Client} from '@libsql/client';
import {getDatabase} from '@shine/database';
import {movieCredits} from '@shine/database/schema/movie-credits';
import {movies} from '@shine/database/schema/movies';
import {people} from '@shine/database/schema/people';
import {translations} from '@shine/database/schema/translations';
import {createD1TestDatabase, migrate} from '@shine/database/testing';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {buildD1ImportStatements, libsqlReader} from '../d1-import-sql';

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../packages/database/migrations',
);

const copiedTables = [
  'movies',
  'people',
  'translations',
  'movie_credits',
  'person_search_entries',
  'movie_search_entries',
  '__drizzle_migrations',
];

const count = async (binding: D1Database, table: string) => {
  const row = await binding
    .prepare(`SELECT count(*) AS n FROM "${table}"`)
    .first<{n: number}>();
  return row?.n;
};

describe('buildD1ImportStatements', () => {
  let directory: string;
  let source: Client;
  let target: D1Database;
  let dispose: () => Promise<void>;
  const importedCounts = new Map<string, number | undefined>();

  beforeAll(async () => {
    directory = mkdtempSync(path.join(tmpdir(), 'shine-d1-import-'));
    const url = `file:${path.join(directory, 'source.db')}`;
    const database = getDatabase({
      TURSO_DATABASE_URL: url,
      TURSO_AUTH_TOKEN: '',
    });
    await migrate(database, {migrationsFolder});
    await database.insert(movies).values({uid: 'movie-1', year: 1954});
    await database.insert(translations).values({
      uid: 'title-1',
      resourceType: 'movie_title',
      resourceUid: 'movie-1',
      languageCode: 'ja',
      content: "七人の侍\n'改行と引用符'",
    });
    await database
      .insert(people)
      .values({uid: 'person-1', tmdbId: 5026, name: '黒澤明'});
    await database.insert(movieCredits).values({
      movieUid: 'movie-1',
      personUid: 'person-1',
      creditId: 'credit-1',
      department: 'Directing',
      job: 'Director',
    });
    source = createClient({url});

    const d1 = await createD1TestDatabase();
    ({dispose} = d1);
    target = d1.binding;
    const statements = await buildD1ImportStatements(libsqlReader(source), {
      pageSize: 7,
    });
    await target.batch(statements.map(statement => target.prepare(statement)));
    for (const table of copiedTables) {
      importedCounts.set(table, await count(target, table));
    }
  }, 60_000);

  afterAll(async () => {
    source?.close();
    await dispose?.();
    rmSync(directory, {recursive: true, force: true});
  });

  it.each(copiedTables)('copies every row of %s', async table => {
    const result = await source.execute(`SELECT count(*) AS n FROM "${table}"`);
    const expected = Number(result.rows[0].n);

    expect(importedCounts.get(table)).toBe(expected);
  });

  it('keeps quotes and line breaks in text', async () => {
    const row = await target
      .prepare(`SELECT content FROM translations WHERE uid = 'title-1'`)
      .first<{content: string}>();

    expect(row?.content).toBe("七人の侍\n'改行と引用符'");
  });

  it('finds a copied movie by its title', async () => {
    const row = await target
      .prepare(
        `SELECT movie_uid FROM movie_search_entries WHERE id IN (SELECT rowid FROM movie_search WHERE movie_search MATCH '"七人 人の"')`,
      )
      .first<{movie_uid: string}>();

    expect(row?.movie_uid).toBe('movie-1');
  });

  it('indexes people added after the import', async () => {
    await target
      .prepare(
        `INSERT INTO people (uid, tmdb_id, name) VALUES ('person-2', 1, '小津安二郎')`,
      )
      .run();

    const row = await target
      .prepare(
        `SELECT person_uid FROM person_search_entries WHERE id IN (SELECT rowid FROM person_search WHERE person_search MATCH '"小津 津安"')`,
      )
      .first<{person_uid: string}>();

    expect(row?.person_uid).toBe('person-2');
  });
});
