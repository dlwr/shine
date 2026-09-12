import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sql} from 'drizzle-orm';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {describe, expect, it} from 'vitest';
import {getDatabase, type Environment} from '../../index';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(currentDirectory, '../../../migrations');

async function createTestDatabase() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-credits-'));
  const environment: Environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});
  return database;
}

describe('movie_credits の索引', () => {
  it('人物ごとの出演本数の集計を索引だけで読む', async () => {
    const database = await createTestDatabase();

    const plan = await database.all<{detail: string}>(sql`
      EXPLAIN QUERY PLAN
      SELECT person_uid, COUNT(DISTINCT movie_uid) AS movie_count
      FROM movie_credits
      WHERE movie_uid NOT IN (SELECT uid FROM movies WHERE deleted_at IS NOT NULL)
      GROUP BY person_uid
      HAVING COUNT(DISTINCT movie_uid) >= 2 OR SUM(job = 'Director') > 0
    `);
    const details = plan.map(row => row.detail);

    expect(
      details.some(detail =>
        detail.startsWith('SCAN movie_credits USING COVERING INDEX'),
      ),
      details.join('\n'),
    ).toBe(true);
    expect(details).not.toContain('USE TEMP B-TREE FOR GROUP BY');
  });
});
