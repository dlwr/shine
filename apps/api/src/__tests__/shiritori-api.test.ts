import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {migrate} from '@shine/database/testing';
import {beforeEach, describe, expect, it} from 'vitest';
import {shiritoriRoutes} from '../routes/shiritori';
import type {ShiritoriChain} from '../types/shiritori';
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
    path.join(os.tmpdir(), 'shine-shiritori-api-'),
  );
  const environment: Environment = {
    DATABASE_FILE_URL: `file:${path.join(directory, 'test.db')}`,
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});
  return {environment, database};
}

describe('GET /shiritori', () => {
  let environment: Environment;
  let database: ReturnType<typeof getDatabase>;

  beforeEach(async () => {
    ({environment, database} = await createTestEnvironment());
  });

  it('今日のしりとりを返す', async () => {
    await seedPublicData(database);

    const response = await shiritoriRoutes.request('/', {}, environment);
    const body: ShiritoriChain = await response.json();

    expect(body.links.map(link => link.title)).toEqual([
      'グラディエーター',
      'アメリカン・ビューティー',
    ]);
  });

  it('from の映画から始める', async () => {
    await seedPublicData(database);

    const response = await shiritoriRoutes.request(
      '/?from=movie-beauty',
      {},
      environment,
    );
    const body: ShiritoriChain = await response.json();

    expect(body.links[0].uid).toBe('movie-beauty');
  });

  it('しりとりに使えない映画が from なら 404 を返す', async () => {
    await seedPublicData(database);

    const response = await shiritoriRoutes.request(
      '/?from=movie-missing',
      {},
      environment,
    );

    expect(response.status).toBe(404);
  });

  it('つなげる映画が無ければ 404 を返す', async () => {
    const response = await shiritoriRoutes.request('/', {}, environment);

    expect(response.status).toBe(404);
  });
});
