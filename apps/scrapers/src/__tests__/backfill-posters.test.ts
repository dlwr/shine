import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {eq} from 'drizzle-orm';
import {getDatabase, type Environment} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {posterUrls} from '@shine/database/schema/poster-urls';
import {translations} from '@shine/database/schema/translations';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  backfillPosters,
  normalizeTitle,
  pickStrictMatch,
} from '../backfill-posters';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

async function createTestEnvironment(): Promise<{
  environment: Environment;
  database: ReturnType<typeof getDatabase>;
}> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shine-poster-'));
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
    title: string;
    year?: number;
    imdbId?: string;
    tmdbId?: number;
  },
): Promise<void> {
  await database.insert(movies).values({
    uid: values.uid,
    year: values.year,
    imdbId: values.imdbId,
    tmdbId: values.tmdbId,
  });
  await database.insert(translations).values({
    resourceType: 'movie_title',
    resourceUid: values.uid,
    languageCode: 'en',
    content: values.title,
    isDefault: 1,
  });
}

describe('normalizeTitle', () => {
  it('大文字小文字を無視する', () => {
    expect(normalizeTitle('Roman Holiday')).toBe(
      normalizeTitle('ROMAN HOLIDAY'),
    );
  });

  it('発音記号を無視する', () => {
    expect(normalizeTitle('Rashômon')).toBe(normalizeTitle('Rashomon'));
  });

  it('記号と空白を無視する', () => {
    expect(normalizeTitle('Spider-Man: No Way Home')).toBe(
      normalizeTitle('Spider Man No Way Home'),
    );
  });

  it('前後の空白を無視する', () => {
    expect(normalizeTitle('  Titane  ')).toBe(normalizeTitle('Titane'));
  });
});

describe('pickStrictMatch', () => {
  const results = [
    {id: 1, title: 'Nostalgia', release_date: '2022-09-04'},
    {id: 2, title: 'Nostalghia', release_date: '1983-01-01'},
  ];

  it('タイトルと年が一致する候補を返す', () => {
    expect(pickStrictMatch(results, 'Nostalgia', 2022)).toBe(1);
  });

  it('年が数年ずれても許容する（DBの年は映画祭の開催年）', () => {
    expect(pickStrictMatch(results, 'Nostalgia', 2019)).toBe(1);
  });

  it('年が離れすぎたら採用しない', () => {
    expect(pickStrictMatch(results, 'Nostalgia', 2015)).toBeUndefined();
  });

  it('同名候補が複数あれば年が近い方を選ぶ', () => {
    const sameTitle = [
      {id: 10, title: 'Monster', release_date: '2003-05-16'},
      {id: 11, title: 'Monster', release_date: '2005-01-01'},
    ];

    expect(pickStrictMatch(sameTitle, 'Monster', 2005)).toBe(11);
  });

  it('タイトルが違えば年が合っても採用しない', () => {
    expect(pickStrictMatch(results, 'Nostalghia', 2022)).toBeUndefined();
  });

  it('原題での一致も認める', () => {
    const withOriginal = [
      {
        id: 3,
        title: 'The Wages of Fear',
        original_title: 'Le salaire de la peur',
        release_date: '1953-04-22',
      },
    ];

    expect(pickStrictMatch(withOriginal, 'Le salaire de la peur', 1953)).toBe(
      3,
    );
  });

  it('公開日が無い候補は採用しない', () => {
    expect(
      pickStrictMatch(
        [{id: 4, title: 'Untitled', release_date: ''}],
        'Untitled',
        2020,
      ),
    ).toBeUndefined();
  });

  it('候補が空なら何も返さない', () => {
    expect(pickStrictMatch([], 'Anything', 2020)).toBeUndefined();
  });
});

const stubTmdb = (
  handlers: Record<string, unknown>,
  onUnmatched: () => Response = () => new Response('nf', {status: 404}),
) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      for (const [fragment, body] of Object.entries(handlers)) {
        if (url.includes(fragment)) {
          return Response.json(body);
        }
      }

      return onUnmatched();
    }),
  );
};

describe('backfillPosters', () => {
  let environment: Environment;
  let database: ReturnType<typeof getDatabase>;

  beforeEach(async () => {
    ({environment, database} = await createTestEnvironment());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const configuration = {
    images: {
      secure_base_url: 'https://image.tmdb.org/t/p/',
      poster_sizes: ['w185', 'w342', 'w500', 'original'],
    },
  };

  it('tmdbIdがある映画にポスターを保存する', async () => {
    await seedMovie(database, {
      uid: 'm1',
      title: '7th Heaven',
      year: 1928,
      tmdbId: 82_474,
    });
    stubTmdb({
      '/configuration': configuration,
      '/movie/82474': {id: 82_474, title: '7th Heaven', poster_path: '/a.jpg'},
    });

    const stats = await backfillPosters({environment, throttleMs: 0});

    expect(stats.postersSaved).toBe(1);
    const [poster] = await database
      .select()
      .from(posterUrls)
      .where(eq(posterUrls.movieUid, 'm1'));
    expect(poster.url).toBe('https://image.tmdb.org/t/p/w500/a.jpg');
    expect(poster.isPrimary).toBe(1);
  });

  it('原寸ではなくw500で保存する', async () => {
    await seedMovie(database, {uid: 'm1', title: 'X', year: 2000, tmdbId: 1});
    stubTmdb({
      '/configuration': configuration,
      '/movie/1': {id: 1, title: 'X', poster_path: '/a.jpg'},
    });

    await backfillPosters({environment, throttleMs: 0});

    const [poster] = await database.select().from(posterUrls);
    expect(poster.url).not.toContain('/original/');
  });

  it('imdbIdからtmdbIdを解決して保存する', async () => {
    await seedMovie(database, {
      uid: 'm1',
      title: 'Rashomon',
      year: 1950,
      imdbId: 'tt0042876',
    });
    stubTmdb({
      '/configuration': configuration,
      '/find/tt0042876': {
        movie_results: [{id: 548, media_type: 'movie'}],
        tv_results: [],
      },
      '/movie/548': {id: 548, title: 'Rashomon', poster_path: '/r.jpg'},
    });

    const stats = await backfillPosters({environment, throttleMs: 0});

    expect(stats.postersSaved).toBe(1);
    const [movie] = await database
      .select()
      .from(movies)
      .where(eq(movies.uid, 'm1'));
    expect(movie.tmdbId).toBe(548);
  });

  it('IDが無い映画はタイトルと年で厳格に照合する', async () => {
    await seedMovie(database, {uid: 'm1', title: 'In Old Chicago', year: 1937});
    stubTmdb({
      '/configuration': configuration,
      '/search/movie': {
        results: [
          {id: 43_884, title: 'In Old Chicago', release_date: '1937-04-15'},
        ],
      },
      '/movie/43884': {
        id: 43_884,
        title: 'In Old Chicago',
        poster_path: '/c.jpg',
      },
    });

    const stats = await backfillPosters({environment, throttleMs: 0});

    expect(stats.postersSaved).toBe(1);
    const [movie] = await database
      .select()
      .from(movies)
      .where(eq(movies.uid, 'm1'));
    expect(movie.tmdbId).toBe(43_884);
  });

  it('タイトルが一致しない候補は採用しない', async () => {
    await seedMovie(database, {uid: 'm1', title: 'In Old Chicago', year: 1937});
    stubTmdb({
      '/configuration': configuration,
      '/search/movie': {
        results: [{id: 999, title: 'Chicago', release_date: '1937-01-01'}],
      },
    });

    const stats = await backfillPosters({environment, throttleMs: 0});

    expect(stats.postersSaved).toBe(0);
    expect(stats.unresolved).toBe(1);
    expect(await database.select().from(posterUrls)).toHaveLength(0);
  });

  it('他の映画が使っているtmdbIdは割り当てない', async () => {
    await seedMovie(database, {
      uid: 'taken',
      title: 'Taken',
      year: 1950,
      tmdbId: 548,
    });
    await database
      .insert(posterUrls)
      .values({movieUid: 'taken', url: 'https://x/p.jpg', sourceType: 'tmdb'});
    await seedMovie(database, {
      uid: 'm1',
      title: 'Rashomon',
      year: 1950,
      imdbId: 'tt0042876',
    });
    stubTmdb({
      '/configuration': configuration,
      '/find/tt0042876': {
        movie_results: [{id: 548, media_type: 'movie'}],
        tv_results: [],
      },
    });

    const stats = await backfillPosters({environment, throttleMs: 0});

    expect(stats.postersSaved).toBe(0);
    const [movie] = await database
      .select()
      .from(movies)
      .where(eq(movies.uid, 'm1'));
    expect(movie.tmdbId).toBeNull();
  });

  it('soft-deletedの映画は対象にしない', async () => {
    await seedMovie(database, {uid: 'm1', title: 'X', year: 2000, tmdbId: 1});
    await database
      .update(movies)
      .set({deletedAt: 1000})
      .where(eq(movies.uid, 'm1'));
    stubTmdb({
      '/configuration': configuration,
      '/movie/1': {id: 1, title: 'X', poster_path: '/a.jpg'},
    });

    const stats = await backfillPosters({environment, throttleMs: 0});

    expect(stats.candidates).toBe(0);
    expect(await database.select().from(posterUrls)).toHaveLength(0);
  });

  it('既にポスターがある映画は対象にしない', async () => {
    await seedMovie(database, {uid: 'm1', title: 'X', year: 2000, tmdbId: 1});
    await database
      .insert(posterUrls)
      .values({movieUid: 'm1', url: 'https://x/p.jpg', sourceType: 'tmdb'});

    const stats = await backfillPosters({environment, throttleMs: 0});

    expect(stats.candidates).toBe(0);
  });

  it('TMDbにポスターが無い場合は保存しない', async () => {
    await seedMovie(database, {uid: 'm1', title: 'X', year: 2000, tmdbId: 1});
    stubTmdb({
      '/configuration': configuration,
      '/movie/1': {id: 1, title: 'X'},
    });

    const stats = await backfillPosters({environment, throttleMs: 0});

    expect(stats.postersSaved).toBe(0);
    expect(stats.noPosterOnTmdb).toBe(1);
  });

  it('dryRunでは書き込まない', async () => {
    await seedMovie(database, {uid: 'm1', title: 'X', year: 2000, tmdbId: 1});
    stubTmdb({
      '/configuration': configuration,
      '/movie/1': {id: 1, title: 'X', poster_path: '/a.jpg'},
    });

    const stats = await backfillPosters({
      environment,
      throttleMs: 0,
      dryRun: true,
    });

    expect(stats.postersSaved).toBe(1);
    expect(await database.select().from(posterUrls)).toHaveLength(0);
  });

  it('limitで処理件数を絞る', async () => {
    await seedMovie(database, {uid: 'm1', title: 'A', year: 2000, tmdbId: 1});
    await seedMovie(database, {uid: 'm2', title: 'B', year: 2001, tmdbId: 2});
    stubTmdb({
      '/configuration': configuration,
      '/movie/1': {id: 1, title: 'A', poster_path: '/a.jpg'},
      '/movie/2': {id: 2, title: 'B', poster_path: '/b.jpg'},
    });

    const stats = await backfillPosters({
      environment,
      throttleMs: 0,
      limit: 1,
    });

    expect(stats.candidates).toBe(1);
    expect(stats.postersSaved).toBe(1);
  });
});
