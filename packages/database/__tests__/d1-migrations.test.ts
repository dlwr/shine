import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createClient} from '@libsql/client';
import {drizzle as drizzleLibsql} from 'drizzle-orm/libsql';
import {migrate as migrateLibsql} from 'drizzle-orm/libsql/migrator';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {createD1TestDatabase} from '../src/testing';

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../migrations',
);

type Row = Record<string, unknown>;

const SCHEMA_QUERIES = {
  columns: String.raw`
    SELECT m.name AS tableName, c.name, c.type, c."notnull", c.dflt_value, c.pk
    FROM sqlite_master m, pragma_table_info(m.name) c
    WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%' AND m.sql NOT LIKE 'CREATE VIRTUAL TABLE%' AND m.name NOT LIKE '\_%' ESCAPE '\'
    ORDER BY m.name, c.cid`,
  foreignKeys: String.raw`
    SELECT m.name AS tableName, f."table", f."from", f."to", f.on_delete
    FROM sqlite_master m, pragma_foreign_key_list(m.name) f
    WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%' AND m.sql NOT LIKE 'CREATE VIRTUAL TABLE%' AND m.name NOT LIKE '\_%' ESCAPE '\'
    ORDER BY m.name, f."from"`,
  objects: String.raw`
    SELECT type, name, tbl_name AS tableName FROM sqlite_master
    WHERE type IN ('table', 'index', 'trigger') AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\_cf\_%' ESCAPE '\'
    ORDER BY type, name`,
} as const;

type Schema = Record<keyof typeof SCHEMA_QUERIES, Row[]>;

const readSchema = async (
  select: (query: string) => Promise<Row[]>,
): Promise<Schema> => ({
  columns: await select(SCHEMA_QUERIES.columns),
  foreignKeys: await select(SCHEMA_QUERIES.foreignKeys),
  objects: await select(SCHEMA_QUERIES.objects),
});

describe('migrations on D1', () => {
  let d1Schema: Schema;
  let libsqlSchema: Schema;
  let dispose: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    const d1 = await createD1TestDatabase({migrationsFolder});
    dispose = d1.dispose;
    d1Schema = await readSchema(async query => {
      const result = await d1.binding.prepare(query).all<Row>();
      return result.results;
    });

    const client = createClient({url: ':memory:'});
    try {
      await migrateLibsql(drizzleLibsql({client}), {migrationsFolder});
      libsqlSchema = await readSchema(async query => {
        const result = await client.execute(query);
        return result.rows.map(row => ({...row}));
      });
    } finally {
      client.close();
    }
  }, 60_000);

  afterAll(async () => {
    await dispose?.();
  });

  it('creates the same columns as libsql', () => {
    expect(d1Schema.columns).toEqual(libsqlSchema.columns);
  });

  it('creates the same foreign keys as libsql', () => {
    expect(d1Schema.foreignKeys).toEqual(libsqlSchema.foreignKeys);
  });

  it('creates the same tables, indexes and triggers as libsql', () => {
    expect(d1Schema.objects).toEqual(libsqlSchema.objects);
  });
});
