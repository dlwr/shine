import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createClient} from '@libsql/client';
import {movies} from '@shine/database/schema/movies';
import {people} from '@shine/database/schema/people';
import {createD1TestDatabase} from '@shine/database/testing';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {backupD1Database, type BackupResult} from '../database-backup';
import {databaseReader} from '../d1-import-sql';

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../packages/database/migrations',
);

describe('backupD1Database', () => {
  let directory: string;
  let outputPath: string;
  let result: BackupResult;
  let dispose: () => Promise<void>;

  beforeAll(async () => {
    const d1 = await createD1TestDatabase({migrationsFolder});
    ({dispose} = d1);
    await d1.database.insert(movies).values([
      {uid: 'm1', year: 2001},
      {uid: 'm2', year: 2002},
    ]);
    await d1.database
      .insert(people)
      .values({uid: 'p1', tmdbId: 5026, name: '黒澤明'});

    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-d1-backup-'));
    outputPath = path.join(directory, 'backup.db');
    result = await backupD1Database(databaseReader(d1.database), outputPath);
  }, 60_000);

  afterAll(async () => {
    await dispose?.();
    await fs.rm(directory, {recursive: true, force: true});
  });

  it('counts the movies in the backup', () => {
    expect(result.movies).toBe(2);
  });

  it('writes a file that passes the integrity check', () => {
    expect(result.integrity).toBe('ok');
  });

  it('keeps the name search index usable', async () => {
    const client = createClient({url: `file:${outputPath}`});
    try {
      const found = await client.execute(
        `SELECT person_uid FROM person_search_entries WHERE id IN (SELECT rowid FROM person_search WHERE person_search MATCH '"黒澤 澤明"')`,
      );
      expect(found.rows.map(row => row.person_uid)).toEqual(['p1']);
    } finally {
      client.close();
    }
  });
});
