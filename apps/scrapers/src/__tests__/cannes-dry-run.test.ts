import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('../common/fetch-utilities', async importOriginal => {
  const actual =
    await importOriginal<typeof import('../common/fetch-utilities')>();
  return {...actual, fetchWithRetry: vi.fn()};
});

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

const yearPageHtml = `
<table class="infobox">
  <tr>
    <th>Palme d'Or</th>
    <td><i><a href="/wiki/Anatomy_of_a_Fall">Anatomy of a Fall</a></i></td>
  </tr>
</table>
<table class="wikitable">
  <tr><th>English title</th><th>Original title</th><th>Director</th></tr>
  <tr>
    <td><i><a href="/wiki/Anatomy_of_a_Fall">Anatomy of a Fall</a></i></td>
    <td>Anatomie d'une chute</td>
    <td>Justine Triet</td>
  </tr>
</table>
`;

let temporaryDirectories: string[] = [];

async function createTestEnvironment(): Promise<{
  environment: Environment;
  database: ReturnType<typeof getDatabase>;
}> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-cannes-'));
  temporaryDirectories.push(directory);
  const environment: Environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});
  return {environment, database};
}

async function loadScraper() {
  vi.resetModules();
  const {fetchWithRetry} = await import('../common/fetch-utilities');
  vi.mocked(fetchWithRetry).mockResolvedValue(yearPageHtml);
  return import('../cannes-film-festival');
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.map(async directory =>
      fs.rm(directory, {recursive: true, force: true}),
    ),
  );
  temporaryDirectories = [];
});

describe('カンヌ映画祭スクレイパーのdry-run', () => {
  it('年を指定したスクレイピングが書き込まずに完走する', async () => {
    const {environment, database} = await createTestEnvironment();
    const {scrapeCannesFilmFestivalYear} = await loadScraper();

    await scrapeCannesFilmFestivalYear(
      {environment, tmdbApiKey: undefined, isDryRun: true},
      2023,
    );

    expect(await database.select().from(awardCeremonies)).toHaveLength(0);
    expect(await database.select().from(movies)).toHaveLength(0);
    expect(await database.select().from(nominations)).toHaveLength(0);
  });

  it('受賞作のみの更新が書き込まずに完走する', async () => {
    const {environment, database} = await createTestEnvironment();
    const {updateCannesWinnersOnly} = await loadScraper();

    await updateCannesWinnersOnly(
      {environment, tmdbApiKey: undefined, isDryRun: true},
      2023,
    );

    expect(await database.select().from(awardCeremonies)).toHaveLength(0);
    expect(await database.select().from(nominations)).toHaveLength(0);
  });
});
