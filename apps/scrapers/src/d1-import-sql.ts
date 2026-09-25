import type {Client, Value} from '@libsql/client';

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

async function schemaObjects(client: Client): Promise<SchemaObject[]> {
  const result = await client.execute(`
    SELECT type, name, tbl_name, sql FROM sqlite_master
    WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
    ORDER BY rowid
  `);
  return result.rows.map(row => ({
    type: String(row.type),
    name: String(row.name),
    tableName: String(row.tbl_name),
    sql: String(row.sql),
  }));
}

async function inDependencyOrder(
  client: Client,
  tables: SchemaObject[],
): Promise<SchemaObject[]> {
  const byName = new Map(tables.map(table => [table.name, table]));
  const dependencies = new Map<string, string[]>();
  for (const table of tables) {
    const result = await client.execute(
      `SELECT "table" FROM pragma_foreign_key_list('${table.name}')`,
    );
    dependencies.set(
      table.name,
      result.rows.map(row => String(row.table)),
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
  client: Client,
  table: string,
  selectColumns: string,
  insertColumns?: string,
): Promise<string[]> {
  const result = await client.execute(
    `SELECT ${selectColumns} FROM "${table}"`,
  );
  const target = insertColumns ? `"${table}" (${insertColumns})` : `"${table}"`;
  return result.rows.map(
    row =>
      `INSERT INTO ${target} VALUES (${Array.from(row, sqlLiteral).join(', ')})`,
  );
}

/** FTS は元の索引の中身をそのまま写し、トリガーは行を入れ終えてから張る */
export async function buildD1ImportStatements(
  client: Client,
): Promise<string[]> {
  const objects = await schemaObjects(client);
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
    client,
    objects.filter(
      object => object.type === 'table' && !excluded.has(object.name),
    ),
  );

  const statements = [
    'PRAGMA defer_foreign_keys = true',
    ...tables.map(table => table.sql),
  ];
  for (const table of tables) {
    append(statements, await insertStatements(client, table.name, '*'));
  }

  for (const table of virtualTables) {
    statements.push(table.sql);
    const columns = await client.execute(
      `SELECT name FROM pragma_table_info('${table.name}')`,
    );
    const names = columns.rows.map(row => `"${String(row.name)}"`);
    append(
      statements,
      await insertStatements(
        client,
        table.name,
        ['rowid', ...names].join(', '),
        ['rowid', ...names].join(', '),
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
