import type {Client, Value} from '@libsql/client';
import {sql, type getDatabase} from '@shine/database';

export type SqlReader = (query: string) => Promise<Value[][]>;

export const libsqlReader =
  (client: Client): SqlReader =>
  async query => {
    const result = await client.execute(query);
    return result.rows.map(row =>
      result.columns.map((_, index) => row[index] ?? null),
    );
  };

export const databaseReader =
  (database: ReturnType<typeof getDatabase>): SqlReader =>
  async query =>
    database.values<Value[]>(sql.raw(query));

const DEFAULT_PAGE_SIZE = 10_000;

type SchemaObject = {
  type: string;
  name: string;
  tableName: string;
  sql: string;
};

const FTS_SHADOW_SUFFIXES = ['data', 'idx', 'content', 'docsize', 'config'];

function sqlLiteral(value: Value): string {
  if (value === null) {
    return 'NULL';
  }

  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }

  if (value instanceof ArrayBuffer) {
    return `X'${Buffer.from(value).toString('hex')}'`;
  }

  return `'${String(value).replaceAll("'", "''")}'`;
}

function append(target: string[], items: string[]): void {
  for (const item of items) {
    target.push(item);
  }
}

async function schemaObjects(read: SqlReader): Promise<SchemaObject[]> {
  const rows = await read(`
    SELECT type, name, tbl_name, sql FROM sqlite_master
    WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
      AND substr(name, 1, 4) <> '_cf_'
    ORDER BY rowid
  `);
  return rows.map(([type, name, tableName, statement]) => ({
    type: String(type),
    name: String(name),
    tableName: String(tableName),
    sql: String(statement),
  }));
}

async function inDependencyOrder(
  read: SqlReader,
  tables: SchemaObject[],
): Promise<SchemaObject[]> {
  const byName = new Map(tables.map(table => [table.name, table]));
  const dependencies = new Map<string, string[]>();
  for (const table of tables) {
    const rows = await read(
      `SELECT "table" FROM pragma_foreign_key_list('${table.name}')`,
    );
    dependencies.set(
      table.name,
      rows.map(([referenced]) => String(referenced)),
    );
  }

  const ordered: SchemaObject[] = [];
  const visited = new Set<string>();
  const visit = (table: SchemaObject) => {
    if (visited.has(table.name)) {
      return;
    }

    visited.add(table.name);
    const tableDependencies = dependencies.get(table.name) ?? [];
    for (const dependency of tableDependencies) {
      const referenced = byName.get(dependency);
      if (referenced) {
        visit(referenced);
      }
    }

    ordered.push(table);
  };

  for (const table of tables) {
    visit(table);
  }

  return ordered;
}

async function insertStatements(
  read: SqlReader,
  table: string,
  columns: string,
  pageSize: number,
  insertColumns?: string,
): Promise<string[]> {
  const target = insertColumns ? `"${table}" (${insertColumns})` : `"${table}"`;
  const statements: string[] = [];
  let lastRowid: Value = -1;
  for (;;) {
    const rows = await read(
      `SELECT rowid, ${columns} FROM "${table}" WHERE rowid > ${String(lastRowid)} ORDER BY rowid LIMIT ${pageSize}`,
    );
    for (const [rowid, ...values] of rows) {
      statements.push(
        `INSERT INTO ${target} VALUES (${values.map(value => sqlLiteral(value)).join(', ')})`,
      );
      lastRowid = rowid;
    }

    if (rows.length < pageSize) {
      return statements;
    }
  }
}

/** FTS は元の索引の中身をそのまま写し、トリガーは行を入れ終えてから張る */
export async function buildD1ImportStatements(
  read: SqlReader,
  {pageSize = DEFAULT_PAGE_SIZE}: {pageSize?: number} = {},
): Promise<string[]> {
  const objects = await schemaObjects(read);
  const virtualTables = objects.filter(
    object =>
      object.type === 'table' && object.sql.startsWith('CREATE VIRTUAL TABLE'),
  );
  const excluded = new Set([
    ...virtualTables.map(table => table.name),
    ...virtualTables.flatMap(table =>
      FTS_SHADOW_SUFFIXES.map(suffix => `${table.name}_${suffix}`),
    ),
  ]);
  const tables = await inDependencyOrder(
    read,
    objects.filter(
      object => object.type === 'table' && !excluded.has(object.name),
    ),
  );

  const statements = [
    'PRAGMA defer_foreign_keys = true',
    ...tables.map(table => table.sql),
  ];
  for (const table of tables) {
    append(statements, await insertStatements(read, table.name, '*', pageSize));
  }

  for (const table of virtualTables) {
    statements.push(table.sql);
    const columns = await read(
      `SELECT name FROM pragma_table_info('${table.name}')`,
    );
    const names = ['rowid', ...columns.map(([name]) => `"${String(name)}"`)];
    append(
      statements,
      await insertStatements(
        read,
        table.name,
        names.join(', '),
        pageSize,
        names.join(', '),
      ),
    );
  }

  append(
    statements,
    objects
      .filter(
        object => object.type === 'index' && !excluded.has(object.tableName),
      )
      .map(object => object.sql),
  );
  append(
    statements,
    objects
      .filter(object => object.type === 'trigger')
      .map(object => object.sql),
  );
  return statements;
}
