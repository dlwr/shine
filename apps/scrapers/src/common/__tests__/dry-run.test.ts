import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {type Environment} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {afterEach, describe, expect, it} from 'vitest';
import {getScrapeDatabase} from '../dry-run';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../../packages/database/migrations',
);

let temporaryDirectories: string[] = [];

async function createTestEnvironment(): Promise<Environment> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-dry-run-'));
  temporaryDirectories.push(directory);
  const environment: Environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
  };
  await migrate(getScrapeDatabase({environment, isDryRun: false}), {
    migrationsFolder,
  });
  return environment;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.map(async directory =>
      fs.rm(directory, {recursive: true, force: true}),
    ),
  );
  temporaryDirectories = [];
});

describe('getScrapeDatabase', () => {
  it('dry-runでない場合は書き込める', async () => {
    const environment = await createTestEnvironment();
    const database = getScrapeDatabase({environment, isDryRun: false});

    await database.insert(movies).values({uid: 'movie', year: 2024});

    expect(await database.select().from(movies)).toHaveLength(1);
  });

  it('dry-runでは書き込みを試みると失敗する', async () => {
    const environment = await createTestEnvironment();
    const database = getScrapeDatabase({environment, isDryRun: true});

    expect(() => database.insert(movies)).toThrow(/dry-run/);
    expect(() => database.update(movies)).toThrow(/dry-run/);
    expect(() => database.delete(movies)).toThrow(/dry-run/);
  });

  it('dry-runでも読み取りはできる', async () => {
    const environment = await createTestEnvironment();
    await getScrapeDatabase({environment, isDryRun: false})
      .insert(movies)
      .values({uid: 'movie', year: 2024});

    const database = getScrapeDatabase({environment, isDryRun: true});

    expect(await database.select().from(movies)).toHaveLength(1);
  });
});
