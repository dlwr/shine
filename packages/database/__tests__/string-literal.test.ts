import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {getDatabase, sql, stringLiteral} from '../src/index';

describe('stringLiteral', () => {
  let directory: string;
  let database: ReturnType<typeof getDatabase>;

  beforeAll(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'shine-literal-'));
    database = getDatabase({
      TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
      TURSO_AUTH_TOKEN: '',
    });
  });

  afterAll(() => {
    rmSync(directory, {recursive: true, force: true});
  });

  it('round-trips a value containing single quotes', async () => {
    const row = await database.get<{value: string}>(
      sql`SELECT ${stringLiteral("Critics' Choice ''x''")} AS value`,
    );

    expect(row.value).toBe("Critics' Choice ''x''");
  });

  it('does not bind the value as a parameter', () => {
    expect(
      database
        .select({value: stringLiteral('a')})
        .from(sql`(SELECT 1)`)
        .toSQL().params,
    ).toEqual([]);
  });
});
