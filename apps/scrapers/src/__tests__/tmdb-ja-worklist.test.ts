import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {movieSelections} from '@shine/database/schema/movie-selections';
import {movies} from '@shine/database/schema/movies';
import {translations} from '@shine/database/schema/translations';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {buildTmdbJaWorklist} from '../tmdb-ja-worklist';

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
    path.join(os.tmpdir(), 'shine-tmdb-worklist-'),
  );
  const environment: Environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
    TMDB_API_KEY: 'test-key',
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});
  return {environment, database};
}

async function seedMovie(
  database: ReturnType<typeof getDatabase>,
  values: {
    uid: string;
    tmdbId?: number;
    jaTitle?: string;
    jaDescription?: string;
    mediaType?: string;
    deletedAt?: number;
  },
): Promise<void> {
  await database.insert(movies).values({
    uid: values.uid,
    tmdbId: values.tmdbId,
    year: 2014,
    originalLanguage: 'en',
    mediaType: values.mediaType ?? 'movie',
    deletedAt: values.deletedAt,
  });
  if (values.jaTitle) {
    await database.insert(translations).values({
      resourceType: 'movie_title',
      resourceUid: values.uid,
      languageCode: 'ja',
      content: values.jaTitle,
    });
  }

  if (values.jaDescription) {
    await database.insert(translations).values({
      resourceType: 'movie_description',
      resourceUid: values.uid,
      languageCode: 'ja',
      content: values.jaDescription,
    });
  }
}

async function seedSelection(
  database: ReturnType<typeof getDatabase>,
  type: 'daily' | 'weekly' | 'monthly',
  date: string,
  movieId: string,
): Promise<void> {
  await database.insert(movieSelections).values({
    selectionType: type,
    selectionDate: date,
    movieId,
  });
}

type TmdbStub = Record<
  number,
  {
    jaTranslation?: {title?: string; overview?: string};
    details?: {title: string; overview?: string};
  }
>;

function stubTmdb(stub: TmdbStub): void {
  vi.stubGlobal('fetch', async (input: unknown) => {
    const url = String(input);
    for (const [id, config] of Object.entries(stub)) {
      if (url.includes(`/movie/${id}/translations`)) {
        return Response.json({
          id: Number(id),
          translations: config.jaTranslation
            ? [
                {
                  iso_3166_1: 'JP',
                  iso_639_1: 'ja',
                  name: '日本語',
                  english_name: 'Japanese',
                  data: {
                    homepage: '',
                    overview: config.jaTranslation.overview ?? '',
                    runtime: 0,
                    tagline: '',
                    title: config.jaTranslation.title ?? '',
                  },
                },
              ]
            : [],
        });
      }

      if (url.includes(`/movie/${id}?`) && config.details) {
        return Response.json({
          id: Number(id),
          title: config.details.title,
          original_title: config.details.title,
          overview: config.details.overview,
          release_date: '2014-01-01',
        });
      }
    }

    return new Response('not found', {status: 404});
  });
}

describe('buildTmdbJaWorklist', () => {
  let environment: Environment;
  let database: ReturnType<typeof getDatabase>;

  beforeEach(async () => {
    ({environment, database} = await createTestEnvironment());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('かな入り邦題がありjaあらすじが無い映画をワークリストに載せる', async () => {
    await seedMovie(database, {
      uid: 'movie-1',
      tmdbId: 312_408,
      jaTitle: '弾丸と共に去りぬ -暗黒街の逃亡者-',
    });
    stubTmdb({
      312_408: {
        details: {title: 'Gone with the Bullets', overview: 'A murder case.'},
      },
    });

    const {items, stats} = await buildTmdbJaWorklist({
      environment,
      throttleMs: 0,
    });

    expect(items).toEqual([
      {
        uid: 'movie-1',
        tmdbId: 312_408,
        year: 2014,
        jaTitle: '弾丸と共に去りぬ -暗黒街の逃亡者-',
        enTitle: 'Gone with the Bullets',
        enOverview: 'A murder case.',
        tmdbJaTitle: undefined,
        tmdbHasJaOverview: false,
        editUrl:
          'https://www.themoviedb.org/movie/312408/edit?active_nav_item=primary_facts',
      },
    ]);
    expect(stats).toEqual({
      candidates: 1,
      listed: 1,
      tmdbComplete: 0,
      failed: 0,
    });
  });

  it('かなを含まない邦題は対象にしない', async () => {
    await seedMovie(database, {
      uid: 'movie-1',
      tmdbId: 312_408,
      jaTitle: '一步之遥',
    });
    stubTmdb({});

    const {items, stats} = await buildTmdbJaWorklist({
      environment,
      throttleMs: 0,
    });

    expect(items).toHaveLength(0);
    expect(stats.candidates).toBe(0);
  });

  it('邦題が無い映画は対象にしない', async () => {
    await seedMovie(database, {uid: 'movie-1', tmdbId: 312_408});
    stubTmdb({});

    const {stats} = await buildTmdbJaWorklist({environment, throttleMs: 0});

    expect(stats.candidates).toBe(0);
  });

  it('jaのあらすじが既にある映画は対象にしない', async () => {
    await seedMovie(database, {
      uid: 'movie-1',
      tmdbId: 312_408,
      jaTitle: 'ブラインド・マッサージ',
      jaDescription: '盲人マッサージ院の物語。',
    });
    stubTmdb({});

    const {stats} = await buildTmdbJaWorklist({environment, throttleMs: 0});

    expect(stats.candidates).toBe(0);
  });

  it('TMDbにjaのタイトルとあらすじが両方ある映画は載せない', async () => {
    await seedMovie(database, {
      uid: 'movie-1',
      tmdbId: 312_408,
      jaTitle: '弾丸と共に去りぬ -暗黒街の逃亡者-',
    });
    stubTmdb({
      312_408: {
        jaTranslation: {
          title: '弾丸と共に去りぬ -暗黒街の逃亡者-',
          overview: '殺人事件の物語。',
        },
      },
    });

    const {items, stats} = await buildTmdbJaWorklist({
      environment,
      throttleMs: 0,
    });

    expect(items).toHaveLength(0);
    expect(stats).toEqual({
      candidates: 1,
      listed: 0,
      tmdbComplete: 1,
      failed: 0,
    });
  });

  it('TMDbにjaタイトルだけある映画はあらすじ補完対象として載せる', async () => {
    await seedMovie(database, {
      uid: 'movie-1',
      tmdbId: 312_408,
      jaTitle: '弾丸と共に去りぬ -暗黒街の逃亡者-',
    });
    stubTmdb({
      312_408: {
        jaTranslation: {title: '弾丸と共に去りぬ -暗黒街の逃亡者-'},
        details: {title: 'Gone with the Bullets', overview: 'A murder case.'},
      },
    });

    const {items} = await buildTmdbJaWorklist({environment, throttleMs: 0});

    expect(items).toHaveLength(1);
    expect(items[0].tmdbJaTitle).toBe('弾丸と共に去りぬ -暗黒街の逃亡者-');
    expect(items[0].tmdbHasJaOverview).toBe(false);
  });

  it('soft-deletedの映画は対象にしない', async () => {
    await seedMovie(database, {
      uid: 'movie-1',
      tmdbId: 312_408,
      jaTitle: 'ブラインド・マッサージ',
      deletedAt: 1000,
    });
    stubTmdb({});

    const {stats} = await buildTmdbJaWorklist({environment, throttleMs: 0});

    expect(stats.candidates).toBe(0);
  });

  it('tmdbIdが無い映画は対象にしない', async () => {
    await seedMovie(database, {
      uid: 'movie-1',
      jaTitle: 'ブラインド・マッサージ',
    });
    stubTmdb({});

    const {stats} = await buildTmdbJaWorklist({environment, throttleMs: 0});

    expect(stats.candidates).toBe(0);
  });

  it('tv作品は対象にしない', async () => {
    await seedMovie(database, {
      uid: 'movie-1',
      tmdbId: 312_408,
      jaTitle: 'ブラインド・マッサージ',
      mediaType: 'tv',
    });
    stubTmdb({});

    const {stats} = await buildTmdbJaWorklist({environment, throttleMs: 0});

    expect(stats.candidates).toBe(0);
  });

  it('limitで処理件数を絞る', async () => {
    await seedMovie(database, {
      uid: 'movie-1',
      tmdbId: 100,
      jaTitle: 'ひとつめ',
    });
    await seedMovie(database, {
      uid: 'movie-2',
      tmdbId: 200,
      jaTitle: 'ふたつめ',
    });
    stubTmdb({
      100: {details: {title: 'First', overview: 'First movie.'}},
      200: {details: {title: 'Second', overview: 'Second movie.'}},
    });

    const {items, stats} = await buildTmdbJaWorklist({
      environment,
      limit: 1,
      throttleMs: 0,
    });

    expect(items).toHaveLength(1);
    expect(stats.candidates).toBe(1);
  });

  it('selectionDateを指定するとその日の選出映画だけを対象にする', async () => {
    await seedMovie(database, {
      uid: 'm-daily',
      tmdbId: 100,
      jaTitle: 'デイリー',
    });
    await seedMovie(database, {
      uid: 'm-weekly',
      tmdbId: 200,
      jaTitle: 'ウィークリー',
    });
    await seedMovie(database, {
      uid: 'm-monthly',
      tmdbId: 300,
      jaTitle: 'マンスリー',
    });
    await seedMovie(database, {
      uid: 'm-other',
      tmdbId: 400,
      jaTitle: 'そのほか',
    });
    await seedSelection(database, 'daily', '2026-08-20', 'm-daily');
    await seedSelection(database, 'weekly', '2026-08-14', 'm-weekly');
    await seedSelection(database, 'monthly', '2026-08-01', 'm-monthly');
    stubTmdb({
      100: {details: {title: 'Daily', overview: 'Daily movie.'}},
      200: {details: {title: 'Weekly', overview: 'Weekly movie.'}},
      300: {details: {title: 'Monthly', overview: 'Monthly movie.'}},
      400: {details: {title: 'Other', overview: 'Other movie.'}},
    });

    const {items, stats} = await buildTmdbJaWorklist({
      environment,
      selectionDate: '2026-08-20',
      throttleMs: 0,
    });

    expect(
      items.map(item => item.uid).toSorted((a, b) => a.localeCompare(b)),
    ).toEqual(['m-daily', 'm-monthly', 'm-weekly']);
    expect(stats.candidates).toBe(3);
  });

  it('選出モードではjaあらすじがあってもTMDb側が欠けていれば載せる', async () => {
    await seedMovie(database, {
      uid: 'm-daily',
      tmdbId: 100,
      jaTitle: 'デイリー',
      jaDescription: '取り込み済みのあらすじ。',
    });
    await seedSelection(database, 'daily', '2026-08-20', 'm-daily');
    stubTmdb({100: {details: {title: 'Daily', overview: 'Daily movie.'}}});

    const {items} = await buildTmdbJaWorklist({
      environment,
      selectionDate: '2026-08-20',
      throttleMs: 0,
    });

    expect(items).toHaveLength(1);
  });

  it('選出モードでもかなを含まない邦題は対象にしない', async () => {
    await seedMovie(database, {
      uid: 'm-daily',
      tmdbId: 100,
      jaTitle: '一步之遥',
    });
    await seedSelection(database, 'daily', '2026-08-20', 'm-daily');
    stubTmdb({});

    const {stats} = await buildTmdbJaWorklist({
      environment,
      selectionDate: '2026-08-20',
      throttleMs: 0,
    });

    expect(stats.candidates).toBe(0);
  });

  it('en詳細が取れない映画はfailedに数える', async () => {
    await seedMovie(database, {
      uid: 'movie-1',
      tmdbId: 312_408,
      jaTitle: '弾丸と共に去りぬ -暗黒街の逃亡者-',
    });
    stubTmdb({312_408: {}});

    const {items, stats} = await buildTmdbJaWorklist({
      environment,
      throttleMs: 0,
    });

    expect(items).toHaveLength(0);
    expect(stats.failed).toBe(1);
  });
});
