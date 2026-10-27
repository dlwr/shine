import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {migrate} from '@shine/database/testing';
import {beforeEach, describe, expect, it} from 'vitest';
import {doubleFeatureRoutes} from '../routes/double-feature';
import type {DoubleFeature} from '../types/double-feature';
import {seedPublicData} from './public-data-seed';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

async function createTestEnvironment(): Promise<{
  environment: Environment;
  database: ReturnType<typeof getDatabase>;
}> {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'shine-double-feature-'),
  );
  const environment: Environment = {
    DATABASE_FILE_URL: `file:${path.join(directory, 'test.db')}`,
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});
  return {environment, database};
}

describe('GET /double-feature', () => {
  let environment: Environment;
  let database: ReturnType<typeof getDatabase>;

  beforeEach(async () => {
    ({environment, database} = await createTestEnvironment());
  });

  it('つながりのある 2 本を返す', async () => {
    await seedPublicData(database);

    const response = await doubleFeatureRoutes.request('/', {}, environment);
    const body: DoubleFeature = await response.json();

    expect(body.movies).toHaveLength(2);
  });

  it('組めなければ 404 を返す', async () => {
    const response = await doubleFeatureRoutes.request('/', {}, environment);

    expect(response.status).toBe(404);
  });
});
