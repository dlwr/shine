import type {Client} from '@libsql/client';
import type {LibSQLDatabase} from 'drizzle-orm/libsql';
import {migrate as migrateLibsql} from 'drizzle-orm/libsql/migrator';

export const migrate = async (
  database: object,
  config: Parameters<typeof migrateLibsql>[1],
) => migrateLibsql(database as LibSQLDatabase, config);

export const libsqlClientOf = (database: object): Client =>
  (database as {$client: Client}).$client;
