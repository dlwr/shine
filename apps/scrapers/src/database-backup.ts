import {mkdir, rm} from 'node:fs/promises';
import path from 'node:path';
import {createClient, type Client} from '@libsql/client';
import {buildD1ImportStatements, type SqlReader} from './d1-import-sql';

export type BackupSource = {
  url: string;
  authToken: string;
};

export type BackupResult = {
  outputPath: string;
  movies: number;
  integrity: string;
};

export async function syncReplica(
  source: BackupSource,
  replicaPath: string,
): Promise<void> {
  const client = createClient({
    url: `file:${replicaPath}`,
    syncUrl: source.url,
    authToken: source.authToken,
  });

  try {
    await client.sync();
  } finally {
    client.close();
  }
}

export async function backupDatabase(
  source: BackupSource,
  outputPath: string,
  sync: typeof syncReplica = syncReplica,
): Promise<BackupResult> {
  const outputDirectory = path.dirname(outputPath);
  const replicaPath = path.join(outputDirectory, 'replica.db');
  await mkdir(outputDirectory, {recursive: true});
  await rm(outputPath, {force: true});
  await removeReplica(replicaPath);

  await sync(source, replicaPath);

  const replica = createClient({url: `file:${replicaPath}`});
  try {
    await replica.execute(`VACUUM INTO '${outputPath.replaceAll("'", "''")}'`);
  } finally {
    replica.close();
  }
  await removeReplica(replicaPath);

  return inspectBackup(outputPath);
}

export async function backupD1Database(
  read: SqlReader,
  outputPath: string,
): Promise<BackupResult> {
  await mkdir(path.dirname(outputPath), {recursive: true});
  await rm(outputPath, {force: true});

  const statements = await buildD1ImportStatements(read);
  const backup = createClient({url: `file:${outputPath}`});
  try {
    await backup.batch(statements, 'write');
  } finally {
    backup.close();
  }

  return inspectBackup(outputPath);
}

async function inspectBackup(outputPath: string): Promise<BackupResult> {
  const backup: Client = createClient({url: `file:${outputPath}`});
  try {
    const [integrity, movies] = await Promise.all([
      backup.execute('PRAGMA integrity_check'),
      backup.execute('SELECT count(*) AS n FROM movies'),
    ]);
    return {
      outputPath,
      movies: Number(movies.rows[0].n),
      integrity: String(integrity.rows[0].integrity_check),
    };
  } finally {
    backup.close();
  }
}

async function removeReplica(replicaPath: string): Promise<void> {
  await Promise.all(
    ['', '-wal', '-shm', '-info', '-client_wal_index'].map(suffix =>
      rm(`${replicaPath}${suffix}`, {force: true}),
    ),
  );
}
