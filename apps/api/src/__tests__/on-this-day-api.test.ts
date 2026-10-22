import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {migrate} from '@shine/database/testing';
import {beforeEach, describe, expect, it} from 'vitest';
import {onThisDayRoutes} from '../routes/on-this-day';
import type {OnThisDay} from '../types/on-this-day';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

async function createTestEnvironment(): Promise<Environment> {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'shine-on-this-day-'),
  );
  const environment: Environment = {
    DATABASE_FILE_URL: `file:${path.join(directory, 'test.db')}`,
  };
  await migrate(getDatabase(environment), {migrationsFolder});
  return environment;
}

describe('GET /on-this-day/:monthDay', () => {
  let environment: Environment;

  beforeEach(async () => {
    environment = await createTestEnvironment();
  });

  it('うるう日を受け付ける', async () => {
    const response = await onThisDayRoutes.request('/02-29', {}, environment);
    const body: OnThisDay = await response.json();

    expect(body.monthDay).toBe('02-29');
  });

  it.each(['13-01', '02-30', '04-31', '00-10', '9-15', 'abc'])(
    '%s は 404 を返す',
    async monthDay => {
      const response = await onThisDayRoutes.request(
        `/${monthDay}`,
        {},
        environment,
      );

      expect(response.status).toBe(404);
    },
  );
});
