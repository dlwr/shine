import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {migrate} from '@shine/database/testing';
import {beforeEach, describe, expect, it} from 'vitest';
import {connectRoutes} from '../routes/connect';
import type {ConnectPick, MovieConnection} from '../types/connect';
import {seedPublicData} from './public-data-seed';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

async function createTestEnvironment(): Promise<Environment> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-connect-'));
  const environment: Environment = {
    DATABASE_FILE_URL: `file:${path.join(directory, 'test.db')}`,
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});
  await seedPublicData(database);
  return environment;
}

describe('GET /connect', () => {
  let environment: Environment;

  beforeEach(async () => {
    environment = await createTestEnvironment();
  });

  it('2 本をつなぐ人物を返す', async () => {
    const response = await connectRoutes.request(
      '/?from=movie-green&to=movie-gladiator',
      {},
      environment,
    );
    const body: MovieConnection = await response.json();

    expect(body.links?.map(link => link.person.name)).toEqual([
      'トム・ハンクス',
    ]);
  });

  it('片方しか無ければ 400 を返す', async () => {
    const response = await connectRoutes.request(
      '/?from=movie-green',
      {},
      environment,
    );

    expect(response.status).toBe(400);
  });

  it('同じ映画どうしは 400 を返す', async () => {
    const response = await connectRoutes.request(
      '/?from=movie-green&to=movie-green',
      {},
      environment,
    );

    expect(response.status).toBe(400);
  });

  it('無い映画なら 404 を返す', async () => {
    const response = await connectRoutes.request(
      '/?from=movie-green&to=movie-missing',
      {},
      environment,
    );

    expect(response.status).toBe(404);
  });
});

describe('GET /connect/pick', () => {
  it('つながる 2 本を返す', async () => {
    const environment = await createTestEnvironment();

    const response = await connectRoutes.request('/pick', {}, environment);
    const body: ConnectPick = await response.json();

    expect(new Set([body.from, body.to])).toEqual(
      new Set(['movie-gladiator', 'movie-green']),
    );
  });
});
