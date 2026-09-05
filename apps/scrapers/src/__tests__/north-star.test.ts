import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDatabase, type Environment} from '@shine/database';
import {articleLinks} from '@shine/database/schema/article-links';
import {movieSelections} from '@shine/database/schema/movie-selections';
import {movies} from '@shine/database/schema/movies';
import {translations} from '@shine/database/schema/translations';
import {migrate} from 'drizzle-orm/libsql/migrator';
import {describe, expect, it} from 'vitest';
import {
  classifySubmission,
  collectMonthlyLinkCounts,
  DEFAULT_OWNER_URL_PREFIXES,
  formatNorthStarReport,
  parseOriginRules,
} from '../north-star';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(
  currentDirectory,
  '../../../../packages/database/migrations',
);

const defaultRules = {
  ownerUrlPrefixes: DEFAULT_OWNER_URL_PREFIXES,
  ownerIps: [],
};

async function createTestDatabase(): Promise<ReturnType<typeof getDatabase>> {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'shine-north-star-'),
  );
  const environment: Environment = {
    TURSO_DATABASE_URL: `file:${path.join(directory, 'test.db')}`,
    TURSO_AUTH_TOKEN: '',
  };
  const database = getDatabase(environment);
  await migrate(database, {migrationsFolder});
  return database;
}

async function seedMonthlySelection(
  database: ReturnType<typeof getDatabase>,
  values: {movieUid: string; month: string; title: string},
): Promise<void> {
  await database.insert(movies).values({
    uid: values.movieUid,
    year: 2020,
    originalLanguage: 'ja',
  });
  await database.insert(translations).values({
    resourceType: 'movie_title',
    resourceUid: values.movieUid,
    languageCode: 'ja',
    content: values.title,
  });
  await database.insert(movieSelections).values({
    selectionType: 'monthly',
    selectionDate: `${values.month}-01`,
    movieId: values.movieUid,
  });
}

describe('classifySubmission', () => {
  it('本人の Scrapbox の URL は owner になる', () => {
    expect(
      classifySubmission(
        {
          url: 'https://scrapbox.io/yuta25/%E3%82%B4%E3%83%83',
          submitterIp: undefined,
        },
        defaultRules,
      ),
    ).toBe('owner');
  });

  it('ループバックからの投稿は test になる', () => {
    expect(
      classifySubmission(
        {url: 'https://example.com/review', submitterIp: '127.0.0.1'},
        defaultRules,
      ),
    ).toBe('test');
  });

  it('IPv6 のループバックも test になる', () => {
    expect(
      classifySubmission(
        {url: 'https://example.com/review', submitterIp: '::1'},
        defaultRules,
      ),
    ).toBe('test');
  });

  it('設定した本人の IP からの投稿は owner になる', () => {
    expect(
      classifySubmission(
        {url: 'https://example.com/review', submitterIp: '2a06:98c0:3600::103'},
        {ownerUrlPrefixes: [], ownerIps: ['2a06:98c0:3600::103']},
      ),
    ).toBe('owner');
  });

  it('本人でもテストでもない投稿は other になる', () => {
    expect(
      classifySubmission(
        {url: 'https://example.com/review', submitterIp: '203.0.113.9'},
        defaultRules,
      ),
    ).toBe('other');
  });

  it('URL が空の投稿は URL では本人と判定しない', () => {
    expect(
      classifySubmission({url: '', submitterIp: '203.0.113.9'}, defaultRules),
    ).toBe('other');
  });
});

describe('parseOriginRules', () => {
  it('環境変数が無ければ既定の Scrapbox プレフィックスを使う', () => {
    expect(parseOriginRules({})).toEqual({
      ownerUrlPrefixes: DEFAULT_OWNER_URL_PREFIXES,
      ownerIps: [],
    });
  });

  it('本人の IP をカンマ区切りで受け取る', () => {
    expect(
      parseOriginRules({NORTH_STAR_OWNER_IPS: '203.0.113.9, 2a06:98c0::1'}),
    ).toEqual({
      ownerUrlPrefixes: DEFAULT_OWNER_URL_PREFIXES,
      ownerIps: ['203.0.113.9', '2a06:98c0::1'],
    });
  });

  it('本人の URL プレフィックスを環境変数で差し替えられる', () => {
    expect(
      parseOriginRules({
        NORTH_STAR_OWNER_URL_PREFIXES: 'https://example.com/me/',
      }).ownerUrlPrefixes,
    ).toEqual(['https://example.com/me/']);
  });
});

describe('collectMonthlyLinkCounts', () => {
  it('月替わりの映画に付いたリンクを投稿元ごとに数える', async () => {
    const database = await createTestDatabase();
    await seedMonthlySelection(database, {
      movieUid: 'movie-1',
      month: '2026-09',
      title: 'ある映画',
    });
    await database.insert(articleLinks).values([
      {
        movieUid: 'movie-1',
        url: 'https://scrapbox.io/yuta25/ある映画',
        title: '鑑賞ノート',
        submittedAt: new Date('2026-09-10T00:00:00+09:00'),
      },
      {
        movieUid: 'movie-1',
        url: 'https://example.com/review',
        title: '感想',
        submittedAt: new Date('2026-09-11T00:00:00+09:00'),
      },
      {
        movieUid: 'movie-1',
        url: 'https://example.com/local',
        title: 'テスト',
        submitterIp: '127.0.0.1',
        submittedAt: new Date('2026-09-12T00:00:00+09:00'),
      },
    ]);

    const counts = await collectMonthlyLinkCounts(database, defaultRules);

    expect(counts).toEqual([
      {
        month: '2026-09',
        title: 'ある映画',
        other: 1,
        owner: 1,
        test: 1,
      },
    ]);
  });

  it('選出月より前に投稿されたリンクは数えない', async () => {
    const database = await createTestDatabase();
    await seedMonthlySelection(database, {
      movieUid: 'movie-1',
      month: '2026-09',
      title: 'ある映画',
    });
    await database.insert(articleLinks).values({
      movieUid: 'movie-1',
      url: 'https://example.com/older',
      title: '前月の感想',
      submittedAt: new Date('2026-08-31T23:00:00+09:00'),
    });

    const counts = await collectMonthlyLinkCounts(database, defaultRules);

    expect(counts[0]?.other).toBe(0);
  });

  it('スパムとフラグ付きのリンクは数えない', async () => {
    const database = await createTestDatabase();
    await seedMonthlySelection(database, {
      movieUid: 'movie-1',
      month: '2026-09',
      title: 'ある映画',
    });
    await database.insert(articleLinks).values([
      {
        movieUid: 'movie-1',
        url: 'https://example.com/spam',
        title: 'スパム',
        isSpam: true,
        submittedAt: new Date('2026-09-10T00:00:00+09:00'),
      },
      {
        movieUid: 'movie-1',
        url: 'https://example.com/flagged',
        title: 'フラグ',
        isFlagged: true,
        submittedAt: new Date('2026-09-10T00:00:00+09:00'),
      },
    ]);

    const counts = await collectMonthlyLinkCounts(database, defaultRules);

    expect(counts[0]?.other).toBe(0);
  });

  it('新しい月から並べる', async () => {
    const database = await createTestDatabase();
    await seedMonthlySelection(database, {
      movieUid: 'movie-1',
      month: '2026-07',
      title: '7月の映画',
    });
    await seedMonthlySelection(database, {
      movieUid: 'movie-2',
      month: '2026-08',
      title: '8月の映画',
    });
    await seedMonthlySelection(database, {
      movieUid: 'movie-3',
      month: '2026-09',
      title: '9月の映画',
    });

    const counts = await collectMonthlyLinkCounts(database, defaultRules);

    expect(counts.map(count => count.month)).toEqual([
      '2026-09',
      '2026-08',
      '2026-07',
    ]);
  });

  it('まだ始まっていない月は除く', async () => {
    const database = await createTestDatabase();
    await seedMonthlySelection(database, {
      movieUid: 'movie-1',
      month: '2026-09',
      title: '9月の映画',
    });
    await seedMonthlySelection(database, {
      movieUid: 'movie-2',
      month: '2026-10',
      title: '10月の映画',
    });

    const counts = await collectMonthlyLinkCounts(database, defaultRules, {
      now: new Date('2026-09-05T12:00:00+09:00'),
    });

    expect(counts.map(count => count.month)).toEqual(['2026-09']);
  });

  it('soft delete された映画の月は除く', async () => {
    const database = await createTestDatabase();
    await seedMonthlySelection(database, {
      movieUid: 'movie-1',
      month: '2026-09',
      title: '消した映画',
    });
    await database
      .update(movies)
      .set({deletedAt: Math.floor(Date.now() / 1000)});

    const counts = await collectMonthlyLinkCounts(database, defaultRules);

    expect(counts).toEqual([]);
  });
});

describe('formatNorthStarReport', () => {
  const now = new Date('2026-09-05T12:00:00+09:00');

  it('他人のリンクが付いた月の数を出す', () => {
    const {content} = formatNorthStarReport(
      [
        {month: '2026-09', title: '9月の映画', other: 0, owner: 1, test: 0},
        {month: '2026-08', title: '8月の映画', other: 0, owner: 1, test: 0},
      ],
      now,
    );

    expect(content).toContain('他人のリンクが付いた月: 0 / 2');
    expect(content).toContain('2026-09-05 時点');
  });

  it('月ごとの内訳を新しい順に並べる', () => {
    const {content} = formatNorthStarReport(
      [
        {month: '2026-09', title: '9月の映画', other: 0, owner: 1, test: 0},
        {month: '2026-08', title: '8月の映画', other: 2, owner: 1, test: 0},
      ],
      now,
    );

    expect(content).toContain('2026-09 9月の映画: 他人 0 / 本人 1');
    expect(content).toContain('2026-08 8月の映画: 他人 2 / 本人 1');
  });

  it('他人のリンクが付いた月があれば達成として報せる', () => {
    const {content, hasOutsideLink} = formatNorthStarReport(
      [{month: '2026-08', title: '8月の映画', other: 1, owner: 1, test: 0}],
      now,
    );

    expect(hasOutsideLink).toBe(true);
    expect(content).toContain('🎉');
  });

  it('他人のリンクが無ければ達成にしない', () => {
    const {hasOutsideLink} = formatNorthStarReport(
      [{month: '2026-08', title: '8月の映画', other: 0, owner: 1, test: 3}],
      now,
    );

    expect(hasOutsideLink).toBe(false);
  });
});
