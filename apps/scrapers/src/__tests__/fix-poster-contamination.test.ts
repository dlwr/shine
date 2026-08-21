import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {posterUrls} from '@shine/database/schema/poster-urls';
import {eq} from 'drizzle-orm';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {beforeEach, describe, expect, it} from 'vitest';
import {
  choosePrimary,
  fixPosterContamination,
  partitionPosters,
  posterFileName,
  type PosterRow,
} from '../fix-poster-contamination';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

const poster = (overrides: Partial<PosterRow>): PosterRow => ({
  uid: 'uid',
  url: 'https://image.tmdb.org/t/p/original/a.jpg',
  languageCode: undefined,
  isPrimary: 0,
  ...overrides,
});

describe('posterFileName', () => {
  it('TMDbのURLからファイル名を取り出す', () => {
    expect(
      posterFileName('https://image.tmdb.org/t/p/original/abc123.jpg'),
    ).toBe('abc123.jpg');
  });

  it('TMDb以外のURLはundefinedを返す', () => {
    expect(posterFileName('https://example.com/poster.jpg')).toBeUndefined();
  });
});

describe('partitionPosters', () => {
  const valid = new Set(['own1.jpg', 'own2.jpg']);

  it('TMDbの画像セットに無いポスターをforeignに分類する', () => {
    const rows = [
      poster({uid: 'a', url: 'https://image.tmdb.org/t/p/original/own1.jpg'}),
      poster({uid: 'b', url: 'https://image.tmdb.org/t/p/original/alien.jpg'}),
    ];

    const {kept, foreign} = partitionPosters(rows, valid);
    expect(kept.map(row => row.uid)).toEqual(['a']);
    expect(foreign.map(row => row.uid)).toEqual(['b']);
  });

  it('TMDb以外のURLは常に残す', () => {
    const rows = [poster({uid: 'a', url: 'https://example.com/manual.jpg'})];

    const {kept, foreign} = partitionPosters(rows, valid);
    expect(kept).toHaveLength(1);
    expect(foreign).toHaveLength(0);
  });
});

describe('choosePrimary', () => {
  it('ja > 言語なし > その他の順で選ぶ', () => {
    const keeper = choosePrimary([
      poster({uid: 'en', languageCode: 'en'}),
      poster({uid: 'none', languageCode: undefined}),
      poster({uid: 'ja', languageCode: 'ja'}),
    ]);
    expect(keeper?.uid).toBe('ja');
  });

  it('同じ言語ランクでは既存のprimaryを優先する', () => {
    const keeper = choosePrimary([
      poster({uid: 'ja1', languageCode: 'ja'}),
      poster({uid: 'ja2', languageCode: 'ja', isPrimary: 1}),
    ]);
    expect(keeper?.uid).toBe('ja2');
  });

  it('jaが無ければ言語なしを選ぶ', () => {
    const keeper = choosePrimary([
      poster({uid: 'ru', languageCode: 'ru', isPrimary: 1}),
      poster({uid: 'none', languageCode: undefined}),
    ]);
    expect(keeper?.uid).toBe('none');
  });

  it('空ならundefined', () => {
    expect(choosePrimary([])).toBeUndefined();
  });
});

const url = (file: string) => `https://image.tmdb.org/t/p/original/${file}`;

describe('fixPosterContamination', () => {
  let environment: Environment;
  let database: ReturnType<typeof getDatabase>;

  const insertMovie = async (uid: string, tmdbId: number | undefined) => {
    await database.insert(movies).values({
      uid,
      year: 2020,
      originalLanguage: 'ja',
      tmdbId,
      imdbId: `tt${uid}`,
    });
  };

  const insertPoster = async (
    movieUid: string,
    file: string,
    options: {languageCode?: string; isPrimary?: number} = {},
  ) => {
    await database.insert(posterUrls).values({
      movieUid,
      url: url(file),
      languageCode: options.languageCode,
      isPrimary: options.isPrimary ?? 0,
      sourceType: 'tmdb',
    });
  };

  const postersOf = async (movieUid: string) =>
    database
      .select({
        url: posterUrls.url,
        isPrimary: posterUrls.isPrimary,
      })
      .from(posterUrls)
      .where(eq(posterUrls.movieUid, movieUid));

  beforeEach(async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'poster-fix-'));
    environment = {
      TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
      TURSO_AUTH_TOKEN: '',
      TMDB_API_KEY: 'test-key',
    };
    database = getDatabase(environment);
    await migrate(database, {migrationsFolder});
  });

  it('TMDbの画像セットに無いポスターを消し、primaryを1枚にする', async () => {
    await insertMovie('m1', 100);
    await insertPoster('m1', 'own-ja.jpg', {languageCode: 'ja', isPrimary: 1});
    await insertPoster('m1', 'own-en.jpg', {languageCode: 'en'});
    await insertPoster('m1', 'alien1.jpg', {languageCode: 'ru', isPrimary: 1});
    await insertPoster('m1', 'alien2.jpg', {languageCode: 'he'});

    const result = await fixPosterContamination(
      {database, environment, isDryRun: false},
      {
        fetchValidPaths: async () => new Set(['own-ja.jpg', 'own-en.jpg']),
      },
    );

    const rows = await postersOf('m1');
    expect(
      rows.map(row => row.url).toSorted((a, b) => a.localeCompare(b)),
    ).toEqual([url('own-en.jpg'), url('own-ja.jpg')]);
    expect(rows.filter(row => row.isPrimary === 1).map(row => row.url)).toEqual(
      [url('own-ja.jpg')],
    );
    expect(result.postersDeleted).toBe(2);
    expect(result.primariesFixed).toBe(0);
  });

  it('primaryが複数残る映画はja優先で1枚に降格する', async () => {
    await insertMovie('m7', 700);
    await insertPoster('m7', 'own-ja.jpg', {languageCode: 'ja', isPrimary: 1});
    await insertPoster('m7', 'own-en.jpg', {languageCode: 'en', isPrimary: 1});

    const result = await fixPosterContamination(
      {database, environment, isDryRun: false},
      {
        fetchValidPaths: async () => new Set(['own-ja.jpg', 'own-en.jpg']),
      },
    );

    const rows = await postersOf('m7');
    expect(rows.filter(row => row.isPrimary === 1).map(row => row.url)).toEqual(
      [url('own-ja.jpg')],
    );
    expect(result.primariesFixed).toBe(1);
  });

  it('primaryが1枚も残らなければ昇格させる', async () => {
    await insertMovie('m8', 800);
    await insertPoster('m8', 'own-en.jpg', {languageCode: 'en'});
    await insertPoster('m8', 'alien.jpg', {languageCode: 'ru', isPrimary: 1});

    const result = await fixPosterContamination(
      {database, environment, isDryRun: false},
      {
        fetchValidPaths: async () => new Set(['own-en.jpg']),
      },
    );

    const rows = await postersOf('m8');
    expect(rows.filter(row => row.isPrimary === 1).map(row => row.url)).toEqual(
      [url('own-en.jpg')],
    );
    expect(result.primariesFixed).toBe(1);
  });

  it('全ポスターがセットに無い映画は消さずに報告する', async () => {
    await insertMovie('m2', 200);
    await insertPoster('m2', 'alien1.jpg');
    await insertPoster('m2', 'alien2.jpg');

    const result = await fixPosterContamination(
      {database, environment, isDryRun: false},
      {
        fetchValidPaths: async () => new Set(['own.jpg']),
      },
    );

    expect(await postersOf('m2')).toHaveLength(2);
    expect(result.zeroOverlap.map(entry => entry.movieUid)).toEqual(['m2']);
    expect(result.postersDeleted).toBe(0);
  });

  it('TMDbを解決できない映画はポスターを消さない', async () => {
    await insertMovie('m3', undefined);
    await insertPoster('m3', 'a.jpg', {isPrimary: 1});
    await insertPoster('m3', 'b.jpg', {isPrimary: 1});

    const result = await fixPosterContamination(
      {database, environment, isDryRun: false},
      {
        // eslint-disable-next-line unicorn/no-useless-undefined -- TMDb未解決を表す
        fetchValidPaths: async () => undefined,
      },
    );

    expect(await postersOf('m3')).toHaveLength(2);
    expect(result.unverified).toBe(1);
  });

  it('乱れの無い映画には書き込まない(dry-runで例外にならない)', async () => {
    await insertMovie('m4', 400);
    await insertPoster('m4', 'own.jpg', {languageCode: 'ja', isPrimary: 1});

    const result = await fixPosterContamination(
      {database, environment, isDryRun: true},
      {
        fetchValidPaths: async () => new Set(['own.jpg']),
      },
    );

    expect(result.postersDeleted).toBe(0);
    expect(result.primariesFixed).toBe(0);
  });

  it('dry-runでは消える件数だけ数えて書き込まない', async () => {
    await insertMovie('m6', 600);
    await insertPoster('m6', 'own.jpg', {languageCode: 'ja', isPrimary: 1});
    await insertPoster('m6', 'alien.jpg', {languageCode: 'ru', isPrimary: 1});

    const result = await fixPosterContamination(
      {database, environment, isDryRun: true},
      {
        fetchValidPaths: async () => new Set(['own.jpg']),
      },
    );

    expect(result.postersDeleted).toBe(1);
    expect(result.primariesFixed).toBe(0);
    expect(await postersOf('m6')).toHaveLength(2);
  });

  it('soft-deletedの映画は対象にしない', async () => {
    await database.insert(movies).values({
      uid: 'm5',
      year: 2020,
      originalLanguage: 'ja',
      tmdbId: 500,
      imdbId: 'ttm5',
      deletedAt: 1,
    });
    await insertPoster('m5', 'alien.jpg');

    const result = await fixPosterContamination(
      {database, environment, isDryRun: false},
      {
        fetchValidPaths: async () => new Set(['own.jpg']),
      },
    );

    expect(result.moviesScanned).toBe(0);
    expect(await postersOf('m5')).toHaveLength(1);
  });
});
