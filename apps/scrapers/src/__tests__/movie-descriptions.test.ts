import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {translations} from '@shine/database/schema/translations';
import {and, eq} from 'drizzle-orm';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {getScrapeDatabase} from '../common/dry-run';
import {
  importMovieDescriptions,
  isJapaneseOverview,
  saveMovieDescription,
} from '../movie-descriptions';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

vi.stubGlobal('fetch', vi.fn());

function stubTmdbDetails(details: unknown) {
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    text: async () => JSON.stringify(details),
  } as unknown as Response);
}

let temporaryDirectories: string[] = [];

async function createTestDatabase() {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'shine-descriptions-'),
  );
  temporaryDirectories.push(directory);
  const environment: Environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
    TMDB_API_KEY: 'test-key',
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});
  const [movie] = await database
    .insert(movies)
    .values({originalLanguage: 'ja', year: 1954, tmdbId: 346})
    .returning();
  return {database, environment, movieUid: movie.uid};
}

async function japaneseDescriptions(
  database: ReturnType<typeof getDatabase>,
): Promise<string[]> {
  const rows = await database
    .select()
    .from(translations)
    .where(
      and(
        eq(translations.resourceType, 'movie_description'),
        eq(translations.languageCode, 'ja'),
      ),
    );
  return rows.map(row => row.content);
}

beforeEach(() => {
  vi.mocked(fetch).mockClear();
});

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.map(async directory =>
      fs.rm(directory, {recursive: true, force: true}),
    ),
  );
  temporaryDirectories = [];
});

describe('isJapaneseOverview', () => {
  it('ひらがなを含む文を受け入れる', () => {
    expect(isJapaneseOverview('侍たちが村を守る話。')).toBe(true);
  });

  it('カタカナだけの文を受け入れる', () => {
    expect(isJapaneseOverview('サムライ・ドキュメンタリー')).toBe(true);
  });

  it('漢字だけの文を受け入れる', () => {
    expect(isJapaneseOverview('七人侍物語')).toBe(true);
  });

  it('英語の文を退ける', () => {
    expect(isJapaneseOverview('A masterpiece by Akira Kurosawa.')).toBe(false);
  });

  it('空文字を退ける', () => {
    expect(isJapaneseOverview('')).toBe(false);
  });

  it('空白だけの文を退ける', () => {
    expect(isJapaneseOverview('   \n  ')).toBe(false);
  });

  it('未定義を退ける', () => {
    expect(isJapaneseOverview(undefined)).toBe(false);
  });
});

describe('saveMovieDescription', () => {
  it('あらすじを translations に保存する', async () => {
    const {database, movieUid} = await createTestDatabase();

    await saveMovieDescription(
      {database, isDryRun: false},
      movieUid,
      '侍たちが村を守る話。',
    );

    expect(await japaneseDescriptions(database)).toEqual([
      '侍たちが村を守る話。',
    ]);
  });

  it('前後の空白を落として保存する', async () => {
    const {database, movieUid} = await createTestDatabase();

    await saveMovieDescription(
      {database, isDryRun: false},
      movieUid,
      '  侍たちが村を守る話。\n',
    );

    expect(await japaneseDescriptions(database)).toEqual([
      '侍たちが村を守る話。',
    ]);
  });

  it('再実行しても重複しない', async () => {
    const {database, movieUid} = await createTestDatabase();

    await saveMovieDescription(
      {database, isDryRun: false},
      movieUid,
      'あらすじ',
    );
    await saveMovieDescription(
      {database, isDryRun: false},
      movieUid,
      'あらすじ',
    );

    expect(await japaneseDescriptions(database)).toHaveLength(1);
  });

  it('既存のあらすじを新しい内容で更新する', async () => {
    const {database, movieUid} = await createTestDatabase();

    await saveMovieDescription(
      {database, isDryRun: false},
      movieUid,
      '古い説明',
    );
    await saveMovieDescription(
      {database, isDryRun: false},
      movieUid,
      '新しい説明',
    );

    expect(await japaneseDescriptions(database)).toEqual(['新しい説明']);
  });

  it('dry-run では書き込まない', async () => {
    const {database, environment, movieUid} = await createTestDatabase();
    const dryRunDatabase = getScrapeDatabase({environment, isDryRun: true});

    await saveMovieDescription(
      {database: dryRunDatabase, isDryRun: true},
      movieUid,
      'あらすじ',
    );

    expect(await japaneseDescriptions(database)).toHaveLength(0);
  });
});

describe('importMovieDescriptions', () => {
  it('日本語のあらすじを保存する', async () => {
    const {database, environment} = await createTestDatabase();
    stubTmdbDetails({
      id: 346,
      title: '七人の侍',
      original_title: '七人の侍',
      release_date: '1954-04-26',
      overview: '戦国時代、野武士に襲われる村を七人の侍が守る。',
    });

    const result = await importMovieDescriptions({
      database,
      environment,
      isDryRun: false,
    });

    expect(await japaneseDescriptions(database)).toEqual([
      '戦国時代、野武士に襲われる村を七人の侍が守る。',
    ]);
    expect(result.saved).toBe(1);
  });

  it('あらすじが空の映画は保存しない', async () => {
    const {database, environment} = await createTestDatabase();
    stubTmdbDetails({
      id: 346,
      title: '七人の侍',
      original_title: '七人の侍',
      release_date: '1954-04-26',
      overview: '',
    });

    const result = await importMovieDescriptions({
      database,
      environment,
      isDryRun: false,
    });

    expect(await japaneseDescriptions(database)).toHaveLength(0);
    expect(result.missing).toBe(1);
  });

  it('日本語でないあらすじは保存しない', async () => {
    const {database, environment} = await createTestDatabase();
    stubTmdbDetails({
      id: 346,
      title: 'Seven Samurai',
      original_title: '七人の侍',
      release_date: '1954-04-26',
      overview: 'A veteran samurai answers a village call for help.',
    });

    const result = await importMovieDescriptions({
      database,
      environment,
      isDryRun: false,
    });

    expect(await japaneseDescriptions(database)).toHaveLength(0);
    expect(result.missing).toBe(1);
  });

  it('あらすじが登録済みの映画はスキップする', async () => {
    const {database, environment, movieUid} = await createTestDatabase();
    await saveMovieDescription(
      {database, isDryRun: false},
      movieUid,
      '登録済みのあらすじ',
    );
    stubTmdbDetails({
      id: 346,
      title: '七人の侍',
      original_title: '七人の侍',
      release_date: '1954-04-26',
      overview: '新しいあらすじ',
    });

    const result = await importMovieDescriptions({
      database,
      environment,
      isDryRun: false,
    });

    expect(await japaneseDescriptions(database)).toEqual([
      '登録済みのあらすじ',
    ]);
    expect(result.skipped).toBe(1);
  });

  it('force では登録済みのあらすじも取り直す', async () => {
    const {database, environment, movieUid} = await createTestDatabase();
    await saveMovieDescription(
      {database, isDryRun: false},
      movieUid,
      '登録済みのあらすじ',
    );
    stubTmdbDetails({
      id: 346,
      title: '七人の侍',
      original_title: '七人の侍',
      release_date: '1954-04-26',
      overview: '新しいあらすじ',
    });

    await importMovieDescriptions(
      {database, environment, isDryRun: false},
      {force: true},
    );

    expect(await japaneseDescriptions(database)).toEqual(['新しいあらすじ']);
  });

  it('soft-delete された映画は対象にしない', async () => {
    const {database, environment, movieUid} = await createTestDatabase();
    await database
      .update(movies)
      .set({deletedAt: 1_700_000_000})
      .where(eq(movies.uid, movieUid));
    stubTmdbDetails({
      id: 346,
      title: '七人の侍',
      original_title: '七人の侍',
      release_date: '1954-04-26',
      overview: 'あらすじ',
    });

    const result = await importMovieDescriptions({
      database,
      environment,
      isDryRun: false,
    });

    expect(await japaneseDescriptions(database)).toHaveLength(0);
    expect(result.saved).toBe(0);
  });

  it('tmdbId のない映画は対象にしない', async () => {
    const {database, environment, movieUid} = await createTestDatabase();
    await database.delete(movies).where(eq(movies.uid, movieUid));
    await database.insert(movies).values({originalLanguage: 'ja', year: 1960});

    const result = await importMovieDescriptions({
      database,
      environment,
      isDryRun: false,
    });

    expect(result.saved).toBe(0);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('limit を超える映画は処理しない', async () => {
    const {database, environment} = await createTestDatabase();
    await database
      .insert(movies)
      .values({originalLanguage: 'ja', year: 1950, tmdbId: 548});
    stubTmdbDetails({
      id: 346,
      title: '七人の侍',
      original_title: '七人の侍',
      release_date: '1954-04-26',
      overview: 'あらすじです',
    });

    const result = await importMovieDescriptions(
      {database, environment, isDryRun: false},
      {limit: 1},
    );

    expect(result.saved).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it('dry-run では書き込まない', async () => {
    const {database, environment} = await createTestDatabase();
    const dryRunDatabase = getScrapeDatabase({environment, isDryRun: true});
    stubTmdbDetails({
      id: 346,
      title: '七人の侍',
      original_title: '七人の侍',
      release_date: '1954-04-26',
      overview: 'あらすじです',
    });

    const result = await importMovieDescriptions({
      database: dryRunDatabase,
      environment,
      isDryRun: true,
    });

    expect(await japaneseDescriptions(database)).toHaveLength(0);
    expect(result.saved).toBe(1);
  });
});
