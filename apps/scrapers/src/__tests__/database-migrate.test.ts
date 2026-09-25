import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {type getDatabase} from '@shine/database';
import {createD1TestDatabase} from '@shine/database/testing';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {pendingMigrationStatements} from '../database-migrate';

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../packages/database/migrations',
);

async function copyMigrationsWithNewOne(directory: string): Promise<string> {
  const folder = path.join(directory, 'migrations');
  await fs.cp(migrationsFolder, folder, {recursive: true});
  const journalPath = path.join(folder, 'meta', '_journal.json');
  const journal = JSON.parse(await fs.readFile(journalPath, 'utf8')) as {
    entries: Array<{idx: number; when: number; tag: string}>;
  };
  const last = journal.entries.at(-1)!;
  journal.entries.push({
    ...last,
    idx: last.idx + 1,
    when: last.when + 1000,
    tag: '9999_test_new_table',
  });
  await fs.writeFile(journalPath, JSON.stringify(journal));
  await fs.writeFile(
    path.join(folder, '9999_test_new_table.sql'),
    'CREATE TABLE `migrate_probe` (`id` integer PRIMARY KEY);',
  );
  return folder;
}

describe('pendingMigrationStatements', () => {
  let directory: string;
  let folder: string;
  let dispose: () => Promise<void>;
  let pendingBefore: string[];
  let pendingAfter: string[];

  beforeAll(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-migrate-'));
    folder = await copyMigrationsWithNewOne(directory);
    const d1 = await createD1TestDatabase({migrationsFolder});
    ({dispose} = d1);
    const database: ReturnType<typeof getDatabase> = d1.database;
    pendingBefore = await pendingMigrationStatements(database, folder);
    await d1.binding.batch(
      pendingBefore.map(statement => d1.binding.prepare(statement)),
    );
    pendingAfter = await pendingMigrationStatements(database, folder);
  }, 60_000);

  afterAll(async () => {
    await dispose?.();
    await fs.rm(directory, {recursive: true, force: true});
  });

  it('returns only the migrations the database has not applied', () => {
    expect(pendingBefore[0]).toBe(
      'CREATE TABLE `migrate_probe` (`id` integer PRIMARY KEY);',
    );
  });

  it('returns nothing once the pending migrations are applied', () => {
    expect(pendingAfter).toEqual([]);
  });
});
