import type {getDatabase} from '@shine/database';
import {migrate} from 'drizzle-orm/sqlite-proxy/migrator';

type MigratableDatabase = Parameters<typeof migrate>[0];

/** 未適用のマイグレーションの文と、それを適用済みとして記録する INSERT を順に返す */
export async function pendingMigrationStatements(
  database: ReturnType<typeof getDatabase>,
  migrationsFolder: string,
): Promise<string[]> {
  let pending: string[] = [];
  await migrate(
    database as unknown as MigratableDatabase,
    async queries => {
      pending = queries;
    },
    {migrationsFolder},
  );
  return pending;
}
