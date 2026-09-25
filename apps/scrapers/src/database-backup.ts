import {mkdir, rm} from 'node:fs/promises';
import path from 'node:path';
import {createClient, type Client} from '@libsql/client';
import {buildD1ImportStatements, type SqlReader} from './d1-import-sql';

export type BackupResult = {
  outputPath: string;
  movies: number;
  integrity: string;
};

export async function backupDatabase(
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
