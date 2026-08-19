import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {movieCredits} from '@shine/database/schema/movie-credits';
import {movies} from '@shine/database/schema/movies';
import {people} from '@shine/database/schema/people';
import {translations} from '@shine/database/schema/translations';
import {eq} from 'drizzle-orm';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {getScrapeDatabase} from '../common/dry-run';
import {
  importMovieCredits,
  saveMovieCredits,
  selectCredits,
} from '../movie-credits';

function creditsFor(creditId: string) {
  return selectCredits({
    cast: [],
    crew: [
      {...crewMember('Director', 'Directing'), id: 5026, credit_id: creditId},
    ],
  });
}

function byText(a: string, b: string): number {
  return a < b ? -1 : 1;
}

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

vi.stubGlobal('fetch', vi.fn());

function stubTmdbCredits(credits: unknown) {
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    text: async () => JSON.stringify(credits),
  } as unknown as Response);
}

let temporaryDirectories: string[] = [];

async function createTestDatabase() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-credits-'));
  temporaryDirectories.push(directory);
  const environment: Environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});
  const [movie] = await database
    .insert(movies)
    .values({originalLanguage: 'ja', year: 1954, imdbId: 'tt0047478'})
    .returning();
  return {database, environment, movieUid: movie.uid};
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.map(async directory =>
      fs.rm(directory, {recursive: true, force: true}),
    ),
  );
  temporaryDirectories = [];
});

function castMember(order: number) {
  return {
    credit_id: `cast-${order}`,
    id: 1000 + order,
    name: `名前${order}`,
    original_name: `Name ${order}`,
    character: `Role ${order}`,
    order,
  };
}

function crewMember(job: string, department: string) {
  return {
    credit_id: `crew-${job}`,
    id: 2000 + job.length,
    name: `名前 ${job}`,
    original_name: `Name ${job}`,
    job,
    department,
  };
}

describe('selectCredits', () => {
  it('キャストを出演順の上位10件に絞る', () => {
    const credits = {
      cast: Array.from({length: 20}, (_, index) => castMember(index)),
      crew: [],
    };

    const selected = selectCredits(credits);

    expect(selected.map(credit => credit.castOrder)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
  });

  it('スタッフは主要な職種だけを残す', () => {
    const credits = {
      cast: [],
      crew: [
        crewMember('Director', 'Directing'),
        crewMember('Screenplay', 'Writing'),
        crewMember('Best Boy Grip', 'Lighting'),
      ],
    };

    const selected = selectCredits(credits);

    expect(selected.map(credit => credit.job)).toEqual([
      'Director',
      'Screenplay',
    ]);
  });
});

describe('saveMovieCredits', () => {
  const sample = selectCredits({
    cast: [castMember(0)],
    crew: [crewMember('Director', 'Directing')],
  });

  it('未知の人物を people に登録する', async () => {
    const {database, movieUid} = await createTestDatabase();

    await saveMovieCredits({database, isDryRun: false}, movieUid, sample);

    const rows = await database.select().from(people);
    expect(rows.map(row => row.tmdbId).toSorted((a, b) => a - b)).toEqual([
      1000, 2008,
    ]);
  });

  it('クレジットを movie_credits に保存する', async () => {
    const {database, movieUid} = await createTestDatabase();

    await saveMovieCredits({database, isDryRun: false}, movieUid, sample);

    const rows = await database.select().from(movieCredits);
    expect(rows.map(row => row.creditId).toSorted(byText)).toEqual([
      'cast-0',
      'crew-Director',
    ]);
  });

  it('再実行しても重複しない', async () => {
    const {database, movieUid} = await createTestDatabase();

    await saveMovieCredits({database, isDryRun: false}, movieUid, sample);
    await saveMovieCredits({database, isDryRun: false}, movieUid, sample);

    const rows = await database.select().from(movieCredits);
    expect(rows).toHaveLength(2);
  });

  it('同じ人物が複数の役割を持っていても people は1件だけ作る', async () => {
    const {database, movieUid} = await createTestDatabase();
    const credits = selectCredits({
      cast: [],
      crew: [
        {...crewMember('Director', 'Directing'), id: 5026},
        {...crewMember('Screenplay', 'Writing'), id: 5026},
      ],
    });

    await saveMovieCredits({database, isDryRun: false}, movieUid, credits);

    const rows = await database.select().from(people);
    expect(rows).toHaveLength(1);
  });

  it('取得結果から消えたクレジットを削除する', async () => {
    const {database, movieUid} = await createTestDatabase();
    await saveMovieCredits({database, isDryRun: false}, movieUid, sample);

    await saveMovieCredits(
      {database, isDryRun: false},
      movieUid,
      sample.filter(credit => credit.creditId === 'cast-0'),
    );

    const rows = await database.select().from(movieCredits);
    expect(rows.map(row => row.creditId)).toEqual(['cast-0']);
  });

  it('日本語名を translations に保存する', async () => {
    const {database, movieUid} = await createTestDatabase();

    await saveMovieCredits({database, isDryRun: false}, movieUid, sample);

    const rows = await database.select().from(translations);
    expect(rows.map(row => row.content).toSorted(byText)).toEqual([
      '名前 Director',
      '名前0',
    ]);
  });

  it('日本語名が原語と同じなら translations に保存しない', async () => {
    const {database, movieUid} = await createTestDatabase();
    const untranslated = selectCredits({
      cast: [{...castMember(0), name: 'Name 0'}],
      crew: [],
    });

    await saveMovieCredits({database, isDryRun: false}, movieUid, untranslated);

    const rows = await database.select().from(translations);
    expect(rows).toHaveLength(0);
  });

  it('同じ人物を含む2本を同時に保存しても people は1件になる', async () => {
    const {database, movieUid} = await createTestDatabase();
    const [other] = await database
      .insert(movies)
      .values({originalLanguage: 'en', year: 1980})
      .returning();
    await Promise.all([
      saveMovieCredits({database, isDryRun: false}, movieUid, creditsFor('a')),
      saveMovieCredits({database, isDryRun: false}, other.uid, creditsFor('b')),
    ]);

    const rows = await database.select().from(people);
    expect(rows).toHaveLength(1);
  });

  it('dry-run では書き込まない', async () => {
    const {database, environment, movieUid} = await createTestDatabase();
    const dryRunDatabase = getScrapeDatabase({environment, isDryRun: true});

    await saveMovieCredits(
      {database: dryRunDatabase, isDryRun: true},
      movieUid,
      sample,
    );

    const rows = await database.select().from(movieCredits);
    expect(rows).toHaveLength(0);
  });
});

describe('importMovieCredits', () => {
  it('クレジット未取得の映画を処理する', async () => {
    const {database, environment, movieUid} = await createTestDatabase();
    await database
      .update(movies)
      .set({tmdbId: 346})
      .where(eq(movies.uid, movieUid));
    stubTmdbCredits({
      cast: [castMember(0)],
      crew: [crewMember('Director', 'Directing')],
    });

    const result = await importMovieCredits({
      database,
      environment,
      isDryRun: false,
    });

    expect(result.processed).toBe(1);
    const rows = await database.select().from(movieCredits);
    expect(rows).toHaveLength(2);
  });

  it('論理削除された映画は処理しない', async () => {
    const {database, environment, movieUid} = await createTestDatabase();
    await database
      .update(movies)
      .set({tmdbId: 346, deletedAt: 1_700_000_000})
      .where(eq(movies.uid, movieUid));
    stubTmdbCredits({cast: [castMember(0)], crew: []});

    const result = await importMovieCredits({
      database,
      environment,
      isDryRun: false,
    });

    expect(result.processed).toBe(0);
  });

  it('すでにクレジットがある映画は取得しない', async () => {
    const {database, environment, movieUid} = await createTestDatabase();
    await database
      .update(movies)
      .set({tmdbId: 346})
      .where(eq(movies.uid, movieUid));
    stubTmdbCredits({cast: [castMember(0)], crew: []});
    await importMovieCredits({database, environment, isDryRun: false});
    vi.mocked(fetch).mockClear();

    const result = await importMovieCredits({
      database,
      environment,
      isDryRun: false,
    });

    expect(result.processed).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('force を指定すると取得済みでも取り直す', async () => {
    const {database, environment, movieUid} = await createTestDatabase();
    await database
      .update(movies)
      .set({tmdbId: 346})
      .where(eq(movies.uid, movieUid));
    stubTmdbCredits({cast: [castMember(0)], crew: []});
    await importMovieCredits({database, environment, isDryRun: false});

    const result = await importMovieCredits(
      {database, environment, isDryRun: false},
      {force: true},
    );

    expect(result.processed).toBe(1);
  });

  it('limit で処理件数を打ち切る', async () => {
    const {database, environment} = await createTestDatabase();
    await database.insert(movies).values([
      {originalLanguage: 'en', year: 1976, tmdbId: 103},
      {originalLanguage: 'en', year: 1980, tmdbId: 104},
    ]);
    stubTmdbCredits({cast: [castMember(0)], crew: []});

    const result = await importMovieCredits(
      {database, environment, isDryRun: false},
      {limit: 1},
    );

    expect(result.processed).toBe(1);
  });

  it('取得に失敗した映画を failed に数える', async () => {
    const {database, environment, movieUid} = await createTestDatabase();
    await database
      .update(movies)
      .set({tmdbId: 346})
      .where(eq(movies.uid, movieUid));
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'not found',
    } as unknown as Response);

    const result = await importMovieCredits({
      database,
      environment,
      isDryRun: false,
    });

    expect(result.failed).toBe(1);
  });

  it('1件が壊れていても残りの映画を処理する', async () => {
    const {database, environment} = await createTestDatabase();
    await database.insert(movies).values([
      {originalLanguage: 'en', year: 1976, tmdbId: 103},
      {originalLanguage: 'en', year: 1980, tmdbId: 104},
    ]);
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({cast: undefined, crew: []}),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({cast: [castMember(0)], crew: []}),
      } as unknown as Response);

    const result = await importMovieCredits({
      database,
      environment,
      isDryRun: false,
    });

    expect(result).toMatchObject({processed: 1, failed: 1});
  });

  it('複数の映画を同時に取得する', async () => {
    const {database, environment} = await createTestDatabase();
    await database.insert(movies).values([
      {originalLanguage: 'en', year: 1976, tmdbId: 103},
      {originalLanguage: 'en', year: 1980, tmdbId: 104},
      {originalLanguage: 'en', year: 1984, tmdbId: 105},
    ]);
    let inFlight = 0;
    let peakInFlight = 0;
    vi.mocked(fetch).mockImplementation(async () => {
      inFlight++;
      peakInFlight = Math.max(peakInFlight, inFlight);
      await new Promise(resolve => {
        setTimeout(resolve, 10);
      });
      inFlight--;
      return {
        ok: true,
        text: async () => JSON.stringify({cast: [], crew: []}),
      } as unknown as Response;
    });

    await importMovieCredits(
      {database, environment, isDryRun: false},
      {concurrency: 3},
    );

    expect(peakInFlight).toBe(3);
  });

  it('同じ人物が別の映画に同時に現れても重複しない', async () => {
    const {database, environment} = await createTestDatabase();
    await database.insert(movies).values([
      {originalLanguage: 'en', year: 1976, tmdbId: 103},
      {originalLanguage: 'en', year: 1980, tmdbId: 104},
    ]);
    vi.mocked(fetch).mockImplementation(async url => {
      const tmdbId = /\/movie\/(\d+)\//.exec(String(url))?.[1] ?? '0';
      const sharedCrew = {
        ...crewMember('Director', 'Directing'),
        id: 5026,
        credit_id: `crew-${tmdbId}`,
      };
      await new Promise(resolve => {
        setTimeout(resolve, 10);
      });
      return {
        ok: true,
        text: async () => JSON.stringify({cast: [], crew: [sharedCrew]}),
      } as unknown as Response;
    });

    const result = await importMovieCredits(
      {database, environment, isDryRun: false},
      {concurrency: 2},
    );

    expect(result.failed).toBe(0);
    const rows = await database.select().from(people);
    expect(rows).toHaveLength(1);
  });
});
