import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import type {Client} from '@libsql/client';
import {drizzle as drizzleD1} from 'drizzle-orm/d1';
import {migrate as migrateD1Database} from 'drizzle-orm/d1/migrator';
import type {LibSQLDatabase} from 'drizzle-orm/libsql';
import {migrate as migrateLibsql} from 'drizzle-orm/libsql/migrator';
import {getDatabase} from './index';

export const migrate = async (
  database: object,
  config: Parameters<typeof migrateLibsql>[1],
) => migrateLibsql(database as LibSQLDatabase, config);

export const libsqlClientOf = (database: object): Client =>
  (database as {$client: Client}).$client;

export const createD1TestDatabase = async (
  config?: Parameters<typeof migrateLibsql>[1],
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
  if (config) {
    await migrateD1Database(drizzleD1(proxy.env.DB), config);
  }
  return {
    binding: proxy.env.DB,
    database: getDatabase({
      DB: proxy.env.DB,
    }),
    async dispose() {
      await proxy.dispose();
      rmSync(directory, {recursive: true, force: true});
    },
  };
};
