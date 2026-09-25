import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createClient} from '@libsql/client';
import {getDatabase} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {libsqlClientOf, migrate} from '@shine/database/testing';
import {beforeAll, describe, expect, it, vi} from 'vitest';
import {backupDatabase, type BackupSource} from '../database-backup';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

const source: BackupSource = {url: 'libsql://example', authToken: 'token'};

let directory: string;
let sourcePath: string;

beforeAll(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-db-backup-'));
  sourcePath = path.join(directory, 'source.db');
  const database = getDatabase({
    TURSO_DATABASE_URL: `file:${sourcePath}`,
    TURSO_AUTH_TOKEN: '',
  });
  await migrate(database, {migrationsFolder});
  await database.insert(movies).values([
    {uid: 'm1', year: 2001},
    {uid: 'm2', year: 2002},
  ]);
  libsqlClientOf(database).close();
});

function copySourceAsReplica(): typeof backupDatabase extends (
  source: BackupSource,
  outputPath: string,
  sync: infer S,
) => unknown
  ? S
  : never {
  return vi.fn(async (_source: BackupSource, replicaPath: string) => {
    await fs.copyFile(sourcePath, replicaPath);
  });
}

describe('backupDatabase', () => {
  it('同期したレプリカを 1 ファイルの SQLite に固める', async () => {
    const outputPath = path.join(directory, 'out', 'shine.db');

    const result = await backupDatabase(
      source,
      outputPath,
      copySourceAsReplica(),
    );

    expect(result).toStrictEqual({
      outputPath,
      movies: 2,
      integrity: 'ok',
    });
  });

  it('固めたファイルは単体で開けて元の行を持つ', async () => {
    const outputPath = path.join(directory, 'out2', 'shine.db');
    await backupDatabase(source, outputPath, copySourceAsReplica());

    const backup = createClient({url: `file:${outputPath}`});
    const rows = await backup.execute('SELECT uid FROM movies ORDER BY uid');
    backup.close();

    expect(rows.rows.map(row => row.uid)).toStrictEqual(['m1', 'm2']);
  });

  it('同期に使ったレプリカは残さない', async () => {
    const outputPath = path.join(directory, 'out3', 'shine.db');
    await backupDatabase(source, outputPath, copySourceAsReplica());

    const left = await fs.readdir(path.dirname(outputPath));

    expect(left).toStrictEqual(['shine.db']);
  });

  it('レプリカへの同期に本番の接続先を渡す', async () => {
    const outputPath = path.join(directory, 'out4', 'shine.db');
    const sync = copySourceAsReplica();

    await backupDatabase(source, outputPath, sync);

    expect(sync).toHaveBeenCalledWith(
      source,
      path.join(directory, 'out4', 'replica.db'),
    );
  });
});
