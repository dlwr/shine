import {is} from 'drizzle-orm';
import {
  getTableConfig,
  SQLiteColumn,
  SQLiteTable,
} from 'drizzle-orm/sqlite-core';
import {describe, expect, it} from 'vitest';
import * as schema from '../index';

const tables = Object.values(schema as Record<string, unknown>).filter(
  (value): value is SQLiteTable => is(value, SQLiteTable),
);

function leadingIndexedColumns(table: SQLiteTable): string[] {
  const config = getTableConfig(table);
  const names = new Set<string>();

  for (const column of config.columns) {
    if (column.primary || column.isUnique) {
      names.add(column.name);
    }
  }

  for (const index of config.indexes) {
    if (index.config.where) {
      continue;
    }

    const first = index.config.columns[0];
    if (is(first, SQLiteColumn)) {
      names.add(first.name);
    }
  }

  for (const unique of config.uniqueConstraints) {
    names.add(unique.columns[0].name);
  }

  for (const primaryKey of config.primaryKeys) {
    names.add(primaryKey.columns[0].name);
  }

  return [...names];
}

function foreignKeyColumns(table: SQLiteTable): string[] {
  return getTableConfig(table).foreignKeys.map(
    foreignKey => foreignKey.reference().columns[0].name,
  );
}

describe('外部キー列の索引', () => {
  for (const table of tables) {
    const {name} = getTableConfig(table);
    for (const column of foreignKeyColumns(table)) {
      it(`${name}.${column} を先頭にした部分条件なしの索引がある`, () => {
        expect(leadingIndexedColumns(table)).toContain(column);
      });
    }
  }
});
