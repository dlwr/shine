import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase} from '@shine/database';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {beforeAll, describe, expect, it} from 'vitest';
import {seedPublicData} from '../../__tests__/public-data-seed';
import {watchedMarks} from '@shine/database/schema/watched-marks';
import {loadSelectionMovie} from '../selection-movie';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../../packages/database/migrations',
);

type Database = ReturnType<typeof getDatabase>;

async function createSeededDatabase(): Promise<Database> {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'shine-selection-movie-'),
  );
  const database = getDatabase({
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
  });
  await migrate(database, {migrationsFolder});
  await seedPublicData(database);
  return database;
}

describe('loadSelectionMovie', () => {
  let database: Database;

  beforeAll(async () => {
    database = await createSeededDatabase();
  });

  it('ja では賞の団体名と部門名に日本語名を添える', async () => {
    const selection = await loadSelectionMovie(database, 'movie-beauty', 'ja');

    const bestPicture = selection.nominations.find(
      nomination =>
        nomination.category.name === 'Academy Award for Best Picture',
    );
    expect(bestPicture?.organization.displayName).toBe('アカデミー賞');
    expect(bestPicture?.category.displayName).toBe('作品賞');
  });

  it('本人以外の「観た」の数を添える', async () => {
    await database.insert(watchedMarks).values([
      {movieUid: 'movie-beauty', submitterIp: '203.0.113.1'},
      {movieUid: 'movie-beauty', submitterIp: '203.0.113.2'},
      {movieUid: 'movie-beauty', submitterIp: '203.0.113.3', isOwner: true},
      {movieUid: 'movie-green', submitterIp: '203.0.113.1'},
    ]);

    const selection = await loadSelectionMovie(database, 'movie-beauty', 'ja');

    expect(selection.watchedCount).toBe(2);
  });

  it('en では日本語名を添えない', async () => {
    const selection = await loadSelectionMovie(database, 'movie-beauty', 'en');

    for (const nomination of selection.nominations) {
      expect(nomination.organization.displayName).toBeUndefined();
      expect(nomination.category.displayName).toBeUndefined();
    }
  });
});
