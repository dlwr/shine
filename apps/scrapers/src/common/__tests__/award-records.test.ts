import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {migrate} from '@shine/database/testing';
import {afterEach, describe, expect, it} from 'vitest';
import {ensureAwardCategory, ensureAwardOrganization} from '../award-records';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../../packages/database/migrations',
);

let temporaryDirectories: string[] = [];

async function createTestDatabase() {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'shine-award-records-'),
  );
  temporaryDirectories.push(directory);
  const database = getDatabase({
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
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

describe('ensureAwardOrganization', () => {
  it('国と設立年つきで団体を作る', async () => {
    const database = await createTestDatabase();

    const uid = await ensureAwardOrganization(database, {
      name: 'Venice Film Festival',
      country: 'Italy',
      establishedYear: 1932,
    });

    const [row] = await database.select().from(awardOrganizations);
    expect(row).toMatchObject({
      uid,
      name: 'Venice Film Festival',
      country: 'Italy',
      establishedYear: 1932,
    });
  });

  it('名前だけでも団体を作る', async () => {
    const database = await createTestDatabase();

    await ensureAwardOrganization(database, {name: '1001 Movies'});

    const [row] = await database.select().from(awardOrganizations);
    expect(row.name).toBe('1001 Movies');
    expect(row.country).toBeNull();
  });

  it('同じ名前なら既存の uid を返し二重に作らない', async () => {
    const database = await createTestDatabase();

    const first = await ensureAwardOrganization(database, {name: 'BAFTA'});
    const second = await ensureAwardOrganization(database, {
      name: 'BAFTA',
      country: 'UK',
    });

    expect(second).toBe(first);
    expect(await database.select().from(awardOrganizations)).toHaveLength(1);
  });
});

describe('ensureAwardCategory', () => {
  it('短い名前つきで部門を作る', async () => {
    const database = await createTestDatabase();
    const organizationUid = await ensureAwardOrganization(database, {
      name: 'Japan Academy Awards',
    });

    const uid = await ensureAwardCategory(database, organizationUid, {
      name: '最優秀作品賞',
      shortName: '作品賞',
    });

    const [row] = await database.select().from(awardCategories);
    expect(row).toMatchObject({
      uid,
      organizationUid,
      name: '最優秀作品賞',
      shortName: '作品賞',
    });
  });

  it('同じ団体の同じ名前なら既存の uid を返す', async () => {
    const database = await createTestDatabase();
    const organizationUid = await ensureAwardOrganization(database, {
      name: 'Japan Academy Awards',
    });

    const first = await ensureAwardCategory(database, organizationUid, {
      name: 'Selected Films',
    });
    const second = await ensureAwardCategory(database, organizationUid, {
      name: 'Selected Films',
    });

    expect(second).toBe(first);
    expect(await database.select().from(awardCategories)).toHaveLength(1);
  });

  it('団体が違えば同じ名前でも別の部門になる', async () => {
    const database = await createTestDatabase();
    const venice = await ensureAwardOrganization(database, {name: 'Venice'});
    const berlin = await ensureAwardOrganization(database, {name: 'Berlin'});

    const first = await ensureAwardCategory(database, venice, {
      name: 'Best Film',
    });
    const second = await ensureAwardCategory(database, berlin, {
      name: 'Best Film',
    });

    expect(second).not.toBe(first);
  });
});
