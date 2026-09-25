import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createClient, type Client} from '@libsql/client';
import {drizzle, type LibSQLDatabase} from 'drizzle-orm/libsql';
import {migrate as migrateLibsql} from 'drizzle-orm/libsql/migrator';
import {getDatabase} from './index';

export const migrate = async (
  database: object,
  config: Parameters<typeof migrateLibsql>[1],
) => migrateLibsql(database as LibSQLDatabase, config);

export const libsqlClientOf = (database: object): Client =>
  (database as {$client: Client}).$client;

type SchemaObject = {type: string; name: string; sql: string};

const inDependencyOrder = async (
  client: Client,
  tables: SchemaObject[],
): Promise<SchemaObject[]> => {
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
      const referenced = tables.find(
        candidate => candidate.name === dependency,
      );
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
};

export const migrateD1 = async (
  d1: D1Database,
  config: Parameters<typeof migrateLibsql>[1],
): Promise<void> => {
  const client = createClient({url: ':memory:'});
  try {
    await migrateLibsql(drizzle({client}), config);
    const result = await client.execute(`
      SELECT type, name, sql FROM sqlite_master
      WHERE sql IS NOT NULL
        AND name NOT LIKE 'sqlite_%'
        AND name NOT LIKE '%search_data'
        AND name NOT LIKE '%search_idx'
        AND name NOT LIKE '%search_content'
        AND name NOT LIKE '%search_docsize'
        AND name NOT LIKE '%search_config'
      ORDER BY rowid
    `);
    const objects = result.rows.map(row => ({
      type: String(row.type),
      name: String(row.name),
      sql: String(row.sql),
    }));
    const tables = await inDependencyOrder(
      client,
      objects.filter(object => object.type === 'table'),
    );
    const statements = [
      ...tables,
      ...objects.filter(object => object.type === 'index'),
      ...objects.filter(object => object.type === 'trigger'),
    ].map(object => d1.prepare(object.sql));
    await d1.batch(statements);
  } finally {
    client.close();
  }
};

export const createD1TestDatabase = async (
  config: Parameters<typeof migrateLibsql>[1],
) => {
  const {getPlatformProxy} = await import('wrangler');
  const directory = mkdtempSync(path.join(tmpdir(), 'shine-d1-test-'));
  const configPath = path.join(directory, 'wrangler.json');
  writeFileSync(
    configPath,
    JSON.stringify({
      name: 'shine-d1-test',
      compatibility_date: '2025-03-26',
      d1_databases: [
        {binding: 'DB', database_id: 'test', database_name: 'test'},
      ],
    }),
  );
  const proxy = await getPlatformProxy<{DB: D1Database}>({
    configPath,
    persist: {path: directory},
  });
  await migrateD1(proxy.env.DB, config);
  return {
    database: getDatabase({
      TURSO_DATABASE_URL: '',
      TURSO_AUTH_TOKEN: '',
      DB: proxy.env.DB,
    }),
    async dispose() {
      await proxy.dispose();
      rmSync(directory, {recursive: true, force: true});
    },
  };
};
