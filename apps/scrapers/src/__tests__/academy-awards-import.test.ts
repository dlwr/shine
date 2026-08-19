import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {translations} from '@shine/database/schema/translations';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('../common/fetch-utilities', () => ({
  fetchWithRetry: vi.fn(),
}));

vi.mock('../common/tmdb-utilities', () => ({
  fetchImdbId: vi.fn(),
  fetchJapaneseTitleFromTMDB: vi.fn(),
  fetchTMDBMovieImages: vi.fn(),
  saveJapaneseTranslation: vi.fn(),
  savePosterUrls: vi.fn(),
  saveTMDBId: vi.fn(),
}));

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

type TestDatabase = ReturnType<typeof getDatabase>;

const wikipediaHtml = `
<table class="wikitable sortable">
  <tr><th>Year</th><th>Film</th><th>Producer(s)</th></tr>
  <tr>
    <th>2024</th>
    <td><i><a href="/wiki/Anora">Anora</a></i></td>
    <td>Alex Coco</td>
  </tr>
</table>
`;

let temporaryDirectories: string[] = [];

async function createTestEnvironment(): Promise<{
  environment: Environment;
  database: TestDatabase;
}> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-academy-'));
  temporaryDirectories.push(directory);
  const environment: Environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
    TMDB_API_KEY: 'test-key',
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});
  await database
    .insert(awardOrganizations)
    .values({uid: 'org', name: 'Academy Awards'});
  await database.insert(awardCategories).values({
    uid: 'cat',
    organizationUid: 'org',
    name: 'Best Picture',
    shortName: 'Best Picture',
  });
  return {environment, database};
}

async function seedMovie(
  database: TestDatabase,
  values: {uid: string; title: string; imdbId: string; deleted?: boolean},
): Promise<void> {
  await database.insert(movies).values({
    uid: values.uid,
    year: 2024,
    imdbId: values.imdbId,
    deletedAt: values.deleted ? Math.floor(Date.now() / 1000) : undefined,
  });
  await database.insert(translations).values({
    resourceType: 'movie_title',
    resourceUid: values.uid,
    languageCode: 'en',
    content: values.title,
    isDefault: 1,
  });
}

async function loadScraper(imdbIdByTitle: Record<string, string>) {
  vi.resetModules();
  const {fetchWithRetry} = await import('../common/fetch-utilities');
  vi.mocked(fetchWithRetry).mockResolvedValue(wikipediaHtml);
  const {fetchImdbId} = await import('../common/tmdb-utilities');
  vi.mocked(fetchImdbId).mockImplementation(
    async (title: string) => imdbIdByTitle[title],
  );
  return import('../academy-awards');
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

describe('scrapeAcademyAwards', () => {
  it('英語タイトルが一致しなくてもIMDb IDで既存映画に紐づける', async () => {
    const {environment, database} = await createTestEnvironment();
    await seedMovie(database, {
      uid: 'existing',
      title: 'Anora (2024 film)',
      imdbId: 'tt1',
    });

    const {scrapeAcademyAwards} = await loadScraper({Anora: 'tt1'});
    await scrapeAcademyAwards({
      environment,
      tmdbApiKey: 'test-key',
      isDryRun: false,
    });

    const savedMovies = await database.select().from(movies);
    expect(savedMovies).toHaveLength(1);

    const savedNominations = await database.select().from(nominations);
    expect(savedNominations).toHaveLength(1);
    expect(savedNominations[0].movieUid).toBe('existing');
  });

  it('soft-delete済みの映画は再作成せずスキップする', async () => {
    const {environment, database} = await createTestEnvironment();
    await seedMovie(database, {
      uid: 'deleted',
      title: 'Anora',
      imdbId: 'tt1',
      deleted: true,
    });

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const {scrapeAcademyAwards} = await loadScraper({Anora: 'tt1'});
    await scrapeAcademyAwards({
      environment,
      tmdbApiKey: 'test-key',
      isDryRun: false,
    });

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();

    const savedMovies = await database.select().from(movies);
    expect(savedMovies).toHaveLength(1);

    const savedNominations = await database.select().from(nominations);
    expect(savedNominations).toHaveLength(0);
  });

  it('dry-runでは書き込みを一切行わない', async () => {
    const {environment, database} = await createTestEnvironment();

    const {scrapeAcademyAwards} = await loadScraper({Anora: 'tt1'});
    await scrapeAcademyAwards({
      environment,
      tmdbApiKey: 'test-key',
      isDryRun: true,
    });

    expect(await database.select().from(movies)).toHaveLength(0);
    expect(await database.select().from(nominations)).toHaveLength(0);
    expect(await database.select().from(awardCeremonies)).toHaveLength(0);
  });

  it('2回実行しても映画とノミネーションが重複しない', async () => {
    const {environment, database} = await createTestEnvironment();

    const {scrapeAcademyAwards} = await loadScraper({Anora: 'tt1'});
    await scrapeAcademyAwards({
      environment,
      tmdbApiKey: 'test-key',
      isDryRun: false,
    });
    await scrapeAcademyAwards({
      environment,
      tmdbApiKey: 'test-key',
      isDryRun: false,
    });

    const savedMovies = await database.select().from(movies);
    expect(savedMovies).toHaveLength(1);

    const savedNominations = await database.select().from(nominations);
    expect(savedNominations).toHaveLength(1);
  });
});
