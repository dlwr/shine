import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase} from '@shine/database';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {migrate} from '@shine/database/testing';
import {afterEach, describe, expect, it} from 'vitest';
import {getAwardContext} from '../award-context';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../../packages/database/migrations',
);

let temporaryDirectories: string[] = [];

async function createTestDatabase() {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'shine-list-award-context-'),
  );
  temporaryDirectories.push(directory);
  const database = getDatabase({
    DATABASE_FILE_URL: `file:${path.join(directory, 'test.db')}`,
  });
  await migrate(database, {migrationsFolder});
  return database;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.map(async directory =>
      fs.rm(directory, {recursive: true, force: true}),
    ),
  );
  temporaryDirectories = [];
});

describe('getAwardContext', () => {
  it('年を指定するとその年の回次を作る', async () => {
    const database = await createTestDatabase();

    const {ceremonyUid} = await getAwardContext(database, {
      organizationName: 'The New York Times',
      categoryName: 'The 100 Best Movies of the 21st Century',
      year: 2025,
    });

    const [ceremony] = await database.select().from(awardCeremonies);
    expect(ceremony).toMatchObject({uid: ceremonyUid, year: 2025});
  });
});
