import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, sql, type Environment} from '@shine/database';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {beforeAll, describe, expect, it} from 'vitest';
import {buildMovieSearchQueries} from '../services/movie-search-query';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

type Database = ReturnType<typeof getDatabase>;
type PlanRow = {id: number; parent: number; detail: string};
type Explainable = {toSQL(): {sql: string; params: unknown[]}};

async function createTestDatabase(): Promise<Database> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-plan-'));
  const environment: Environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});
  return database;
}

async function explain(
  database: Database,
  query: Explainable,
): Promise<PlanRow[]> {
  const {sql: text, params} = query.toSQL();
  const pieces = text
    .split('?')
    .flatMap((chunk, index) =>
      index < params.length
        ? [sql.raw(chunk), sql`${params[index]}`]
        : [sql.raw(chunk)],
    );
  return database.all<PlanRow>(sql`EXPLAIN QUERY PLAN ${sql.join(pieces)}`);
}

function isUnderCorrelatedSubquery(rows: PlanRow[], row: PlanRow): boolean {
  const byId = new Map(rows.map(current => [current.id, current]));
  let parent = byId.get(row.parent);
  while (parent) {
    if (parent.detail.startsWith('CORRELATED')) {
      return true;
    }

    parent = byId.get(parent.parent);
  }

  return false;
}

function tablesReadPerMovie(rows: PlanRow[]): string[] {
  return rows
    .filter(row => isUnderCorrelatedSubquery(rows, row))
    .map(row => row.detail);
}

function fullScansPerMovie(rows: PlanRow[]): string[] {
  return rows
    .filter(
      row =>
        row.detail.startsWith('SCAN ') && isUnderCorrelatedSubquery(rows, row),
    )
    .map(row => row.detail);
}

describe('映画検索クエリの実行計画', () => {
  let database: Database;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  it('検索語なしの一覧は映画ごとのサブクエリで全件走査をしない', async () => {
    const {results} = buildMovieSearchQueries(database, {page: 1, limit: 100});

    expect(fullScansPerMovie(await explain(database, results))).toEqual([]);
  });

  it('検索語なしの件数は映画ごとのサブクエリで全件走査をしない', async () => {
    const {count} = buildMovieSearchQueries(database, {page: 1, limit: 100});

    expect(fullScansPerMovie(await explain(database, count))).toEqual([]);
  });

  it('検索語つきの一覧は映画ごとのサブクエリで全件走査をしない', async () => {
    const {results} = buildMovieSearchQueries(database, {
      page: 1,
      limit: 20,
      query: '黒澤',
    });

    expect(fullScansPerMovie(await explain(database, results))).toEqual([]);
  });

  it('検索語つきの件数は映画ごとのサブクエリで全件走査をしない', async () => {
    const {count} = buildMovieSearchQueries(database, {
      page: 1,
      limit: 20,
      query: '黒澤',
    });

    expect(fullScansPerMovie(await explain(database, count))).toEqual([]);
  });

  it('受賞ありで絞る一覧は映画ごとのサブクエリで全件走査をしない', async () => {
    const {results} = buildMovieSearchQueries(database, {
      page: 1,
      limit: 20,
      hasAwards: true,
    });

    expect(fullScansPerMovie(await explain(database, results))).toEqual([]);
  });

  it('検索語の人物一致は映画ごとのサブクエリの中で movie_credits を引かない', async () => {
    const {results} = buildMovieSearchQueries(database, {
      page: 1,
      limit: 20,
      query: '黒澤',
    });

    expect(
      tablesReadPerMovie(await explain(database, results)).filter(detail =>
        detail.includes('movie_credits'),
      ),
    ).toEqual([]);
  });
});
