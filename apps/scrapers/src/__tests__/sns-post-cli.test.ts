import fs from 'node:fs/promises';
import process from 'node:process';
import {getDatabase} from '@shine/database';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {findUnannouncedMonthlyLinks, markLinksAnnounced} from '../north-star';
import {createSession, publishPost, uploadBlob} from '../sns/bluesky';
import {postTweet} from '../sns/x';
import {createCommand} from '../sns-post-cli';

vi.mock('dotenv', () => ({config: vi.fn()}));
vi.mock('node:fs/promises', () => ({default: {readFile: vi.fn()}}));
vi.mock('@shine/database', async importOriginal => ({
  ...(await importOriginal<typeof import('@shine/database')>()),
  getDatabase: vi.fn(() => ({})),
}));
vi.mock('../north-star', () => ({
  findUnannouncedMonthlyLinks: vi.fn(),
  markLinksAnnounced: vi.fn(),
}));
vi.mock('../sns/bluesky', async importOriginal => ({
  ...(await importOriginal<typeof import('../sns/bluesky')>()),
  createSession: vi.fn(),
  uploadBlob: vi.fn(),
  publishPost: vi.fn(),
}));
vi.mock('../sns/x', async importOriginal => ({
  ...(await importOriginal<typeof import('../sns/x')>()),
  postTweet: vi.fn(),
}));

const API_URL = 'https://shine-api.yuta25.workers.dev';

const dailyMovie = {
  uid: 'daily-uid',
  title: 'フライングハイ',
  year: 1980,
  nominations: [
    {
      organization: {
        name: 'Golden Globe Awards',
        shortName: 'GG',
        displayName: 'ゴールデングローブ賞',
      },
    },
    {
      organization: {
        name: 'Academy Awards',
        shortName: 'Oscars',
        displayName: 'アカデミー賞',
      },
    },
    {organization: {name: '1001 Movies You Must See Before You Die'}},
  ],
  availability: [
    {source: 'tmdb', detail: 'Amazon Video(レンタル)'},
    {source: 'unext'},
  ],
};

const monthlyMovie = {
  uid: 'monthly-uid',
  title: 'ぬいぐるみとしゃべる人はやさしい',
  year: 2023,
  nominations: [{organization: {name: 'POPEYE'}}],
  availability: [
    {source: 'tmdb', detail: 'U-NEXT(見放題)'},
    {source: 'unext'},
    {source: 'discas'},
  ],
};

const awards = [
  {
    slug: 'golden-globe-best-picture',
    name: '作品賞',
    organization: 'ゴールデングローブ賞',
    grouping: 'year',
  },
  {
    slug: 'academy-best-picture',
    name: '作品賞',
    organization: 'アカデミー賞',
    grouping: 'year',
  },
  {
    slug: 'cannes-grand-prix',
    name: 'グランプリ',
    organization: 'カンヌ国際映画祭',
    grouping: 'year',
    subAward: true,
  },
  {
    slug: 'kinema-junpo-japanese',
    name: '日本映画ベスト・テン',
    organization: 'キネマ旬報',
    grouping: 'year',
  },
  {slug: 'popeye', name: 'POPEYE', organization: 'POPEYE', grouping: 'list'},
];

const prominentPeople = {
  directors: [
    {
      uid: 'person-b',
      name: '舛田利雄',
      wonCount: 3,
      nominatedCount: 5,
      topMovies: [
        {uid: 'movie-1', title: '社葬', year: 1989},
        {uid: 'movie-2', year: 1990},
      ],
    },
  ],
  actors: [
    {
      uid: 'person-a',
      name: '受賞なし',
      wonCount: 0,
      nominatedCount: 2,
      topMovies: [],
    },
    {
      uid: 'person-c',
      name: '若尾文子',
      wonCount: 1,
      nominatedCount: 1,
      topMovies: [{uid: 'movie-3', title: '妻は告白する', year: 1961}],
    },
  ],
};

const announcement = {
  text: '第83回ヴェネツィア国際映画祭、金獅子賞は『Woman Unknown』。',
  url: 'https://shine-film.com/awards/venice-golden-lion/2026',
  title: '第83回ヴェネツィア国際映画祭 金獅子賞（2026年） | SHINE',
  description: '金獅子賞は『Woman Unknown』。歴代の受賞作の一覧。',
  imageUrl: 'https://shine-film.com/og/movie.png?id=venice-uid',
};

type Routes = Record<string, unknown>;

function buildRoutes(overrides: Routes = {}): Routes {
  return {
    '/?locale=ja': {daily: dailyMovie, monthly: monthlyMovie},
    '/movies/monthly-uid/article-links': [{}, {}, {}],
    '/quiz/daily': {date: '2026-09-13', poolSize: 3150},
    '/awards': {awards},
    '/awards/golden-globe-best-picture': {
      years: [
        {movies: [{isWinner: true}, {isWinner: false}]},
        {movies: [{isWinner: true}]},
        {movies: [{isWinner: true}, {isWinner: true}]},
      ],
    },
    '/awards/academy-best-picture': {years: [{movies: [{isWinner: true}]}]},
    '/awards/kinema-junpo-japanese': {
      years: [{movies: [{isWinner: true}, {isWinner: true}]}],
    },
    '/people/prominent?locale=ja&limit=200': prominentPeople,
    '/auth/login': {token: 'admin-token'},
    '/admin/preview-selections?locale=ja': {
      nextMonthly: {movie: {title: 'さざなみ'}},
    },
    ...overrides,
  };
}

function stubFetch(
  routes: Routes,
  options: {ogImageStatus?: number} = {},
): void {
  vi.mocked(fetch).mockImplementation(async input => {
    const url = String(input);
    if (url.startsWith('https://shine-film.com/og/')) {
      return new Response(new Uint8Array([1, 2, 3]), {
        status: options.ogImageStatus ?? 200,
      });
    }

    const body = routes[url.replace(API_URL, '')];
    return body === undefined
      ? new Response('not found', {status: 404})
      : Response.json(body);
  });
}

async function runCli(...arguments_: string[]): Promise<string> {
  await createCommand().parseAsync(arguments_, {from: 'user'});
  return vi
    .mocked(console.log)
    .mock.calls.map(call => call.map(String).join(' '))
    .join('\n');
}

function errorOutput(): string {
  return vi
    .mocked(console.error)
    .mock.calls.map(call => call.map(String).join(' '))
    .join('\n');
}

beforeEach(() => {
  vi.useFakeTimers({toFake: ['Date']});
  vi.setSystemTime(new Date('2026-09-13T03:00:00Z'));
  vi.stubEnv('SHINE_API_URL', undefined);
  vi.stubEnv('ADMIN_PASSWORD', '');
  vi.stubEnv('DATABASE_FILE_URL', 'file:sns-post-test.db');
  vi.stubEnv('BLUESKY_IDENTIFIER', undefined);
  vi.stubEnv('BLUESKY_APP_PASSWORD', undefined);
  vi.stubEnv('X_API_KEY', undefined);
  vi.stubEnv('X_API_KEY_SECRET', undefined);
  vi.stubEnv('X_ACCESS_TOKEN', undefined);
  vi.stubEnv('X_ACCESS_TOKEN_SECRET', undefined);
  vi.mocked(console.log).mockClear();
  vi.mocked(console.error).mockClear();
  vi.mocked(fetch).mockReset();
  vi.mocked(fs.readFile).mockReset();
  vi.mocked(getDatabase).mockClear();
  vi.mocked(findUnannouncedMonthlyLinks).mockReset();
  vi.mocked(markLinksAnnounced).mockReset();
  vi.mocked(createSession).mockReset();
  vi.mocked(uploadBlob).mockReset();
  vi.mocked(publishPost).mockReset();
  vi.mocked(postTweet).mockReset();
  process.exitCode = undefined;
  stubFetch(buildRoutes());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  process.exitCode = undefined;
});

describe('sns-post --dry-run', () => {
  it('日替わりの本文とカードを出す', async () => {
    const output = await runCli('--dry-run');

    expect(output).toMatchInlineSnapshot(`
      "--- Bluesky投稿内容 ---
      今日の1本 —『フライングハイ』(1980)
      ゴールデングローブ賞・アカデミー賞 選出
      ▶ レンタル配信あり / U-NEXT
      今月の1本は『ぬいぐるみとしゃべる人はやさしい』
      #青空映画部
      --- リンクカード ---
      uri:   https://shine-film.com/movies/daily-uid
      title: フライングハイ (1980) | SHINE
      thumb: https://shine-film.com/og/movie.png?id=daily-uid
      --- X投稿内容 ---
      今日の1本 —『フライングハイ』(1980)
      ゴールデングローブ賞・アカデミー賞 選出
      ▶ レンタル配信あり / U-NEXT
      今月の1本は『ぬいぐるみとしゃべる人はやさしい』
      shine-film.com/movies/daily-uid

      (dry-run: 投稿していません)"
    `);
    expect(process.exitCode).toBeUndefined();
  });

  it('--monthly で今月の1本の本文とカードを出す', async () => {
    const output = await runCli('--monthly', '--dry-run');

    expect(output).toMatchInlineSnapshot(`
      "--- Bluesky投稿内容 ---
      今月の1本 —『ぬいぐるみとしゃべる人はやさしい』(2023)
      POPEYE 選出
      ▶ U-NEXT 見放題 / 宅配レンタル
      今月はみんなでこれを観る。観たら感想や記事のリンクを映画ページに貼ってください。
      #青空映画部
      --- リンクカード ---
      uri:   https://shine-film.com/movies/monthly-uid
      title: ぬいぐるみとしゃべる人はやさしい (2023) | SHINE
      thumb: https://shine-film.com/og/movie.png?id=monthly-uid
      --- X投稿内容 ---
      今月の1本 —『ぬいぐるみとしゃべる人はやさしい』(2023)
      POPEYE 選出
      ▶ U-NEXT 見放題 / 宅配レンタル
      今月はみんなでこれを観る。観たら感想や記事のリンクを映画ページに貼ってください。
      shine-film.com/movies/monthly-uid

      (dry-run: 投稿していません)"
    `);
  });

  it('--monthly-reminder で記事・ポストの件数を添えて出す', async () => {
    const output = await runCli('--monthly-reminder', '--dry-run');

    expect(output).toMatchInlineSnapshot(`
      "--- Bluesky投稿内容 ---
      今月の1本『ぬいぐるみとしゃべる人はやさしい』(2023)、もう観た？
      今月は残り半分。▶ U-NEXT 見放題 / 宅配レンタル
      観た人の記事・ポストが3件集まっています。観たら映画ページにリンクを貼ってください。
      #青空映画部
      --- リンクカード ---
      uri:   https://shine-film.com/movies/monthly-uid
      title: ぬいぐるみとしゃべる人はやさしい (2023) | SHINE
      thumb: https://shine-film.com/og/movie.png?id=monthly-uid
      --- X投稿内容 ---
      今月の1本『ぬいぐるみとしゃべる人はやさしい』(2023)、もう観た？
      今月は残り半分。▶ U-NEXT 見放題 / 宅配レンタル
      観た人の記事・ポストが3件集まっています。観たら映画ページにリンクを貼ってください。
      shine-film.com/movies/monthly-uid

      (dry-run: 投稿していません)"
    `);
  });

  it('--monthly-roundup は ADMIN_PASSWORD があれば来月の予告を付ける', async () => {
    vi.stubEnv('ADMIN_PASSWORD', 'secret');

    const output = await runCli('--monthly-roundup', '--dry-run');

    expect(output).toMatchInlineSnapshot(`
      "--- Bluesky投稿内容 ---
      今月の1本『ぬいぐるみとしゃべる人はやさしい』(2023)、観た人の記事・ポストは3件。
      映画ページから読めます。
      来月の1本は『さざなみ』。明日から。
      #青空映画部
      --- リンクカード ---
      uri:   https://shine-film.com/movies/monthly-uid
      title: ぬいぐるみとしゃべる人はやさしい (2023) | SHINE
      thumb: https://shine-film.com/og/movie.png?id=monthly-uid
      --- X投稿内容 ---
      今月の1本『ぬいぐるみとしゃべる人はやさしい』(2023)、観た人の記事・ポストは3件。
      映画ページから読めます。
      来月の1本は『さざなみ』。明日から。
      shine-film.com/movies/monthly-uid

      (dry-run: 投稿していません)"
    `);
  });

  it('--monthly-preview は来月の1本と始まる日を出す', async () => {
    vi.stubEnv('ADMIN_PASSWORD', 'secret');
    stubFetch(
      buildRoutes({
        '/admin/preview-selections?locale=ja': {
          nextMonthly: {
            date: '2026-10-01',
            movie: {
              uid: 'next-monthly-uid',
              title: 'さざなみ',
              year: 2015,
              nominations: [
                {
                  organization: {
                    name: 'Academy Awards',
                    slug: 'academy-best-picture',
                  },
                },
              ],
              availability: [{source: 'tmdb', detail: 'MUBI(見放題)'}],
            },
          },
        },
      }),
    );

    const output = await runCli('--monthly-preview', '--dry-run');

    expect(output).toContain('来月の1本 —『さざなみ』(2015)');
    expect(output).toContain('10月1日から、みんなでこれを観ます。');
    expect(output).toContain(
      'uri:   https://shine-film.com/movies/next-monthly-uid',
    );
  });

  it('--monthly-preview は ADMIN_PASSWORD が無ければ失敗する', async () => {
    await runCli('--monthly-preview', '--dry-run');

    expect(errorOutput()).toContain('ADMIN_PASSWORD が設定されていません');
    expect(process.exitCode).toBe(1);
  });

  it('--monthly-roundup は ADMIN_PASSWORD が無ければ予告を省く', async () => {
    const output = await runCli('--monthly-roundup', '--dry-run');

    expect(output).toMatchInlineSnapshot(`
      "--- Bluesky投稿内容 ---
      今月の1本『ぬいぐるみとしゃべる人はやさしい』(2023)、観た人の記事・ポストは3件。
      映画ページから読めます。
      #青空映画部
      --- リンクカード ---
      uri:   https://shine-film.com/movies/monthly-uid
      title: ぬいぐるみとしゃべる人はやさしい (2023) | SHINE
      thumb: https://shine-film.com/og/movie.png?id=monthly-uid
      --- X投稿内容 ---
      今月の1本『ぬいぐるみとしゃべる人はやさしい』(2023)、観た人の記事・ポストは3件。
      映画ページから読めます。
      shine-film.com/movies/monthly-uid

      (dry-run: 投稿していません)"
    `);
  });

  it('--monthly-roundup は予告の取得に失敗しても本文を出す', async () => {
    vi.stubEnv('ADMIN_PASSWORD', 'secret');
    stubFetch(buildRoutes({'/auth/login': undefined}));

    const output = await runCli('--monthly-roundup', '--dry-run');

    expect(output).toMatchInlineSnapshot(`
      "来月の1本が取れないため予告を省きます: Error: Admin login failed: HTTP 404
      --- Bluesky投稿内容 ---
      今月の1本『ぬいぐるみとしゃべる人はやさしい』(2023)、観た人の記事・ポストは3件。
      映画ページから読めます。
      #青空映画部
      --- リンクカード ---
      uri:   https://shine-film.com/movies/monthly-uid
      title: ぬいぐるみとしゃべる人はやさしい (2023) | SHINE
      thumb: https://shine-film.com/og/movie.png?id=monthly-uid
      --- X投稿内容 ---
      今月の1本『ぬいぐるみとしゃべる人はやさしい』(2023)、観た人の記事・ポストは3件。
      映画ページから読めます。
      shine-film.com/movies/monthly-uid

      (dry-run: 投稿していません)"
    `);
  });

  it('--monthly-links で未紹介の記事・ポストを紹介する', async () => {
    vi.mocked(findUnannouncedMonthlyLinks).mockResolvedValue({
      movieUid: 'monthly-uid',
      title: 'ぬいぐるみとしゃべる人はやさしい',
      year: 2023,
      linkUids: ['link-1', 'link-2', 'link-3'],
    });

    const output = await runCli('--monthly-links', '--dry-run');

    expect(output).toMatchInlineSnapshot(`
      "--- Bluesky投稿内容 ---
      今月の1本『ぬいぐるみとしゃべる人はやさしい』(2023)に、観た人の記事・ポストが3件付きました。
      映画ページから読めます。観たら、ひとことでも書いてください。
      #青空映画部
      --- リンクカード ---
      uri:   https://shine-film.com/movies/monthly-uid#article-links
      title: ぬいぐるみとしゃべる人はやさしい | SHINE
      thumb: https://shine-film.com/og/movie.png?id=monthly-uid
      --- X投稿内容 ---
      今月の1本『ぬいぐるみとしゃべる人はやさしい』(2023)に、観た人の記事・ポストが3件付きました。
      映画ページから読めます。観たら、ひとことでも書いてください。
      shine-film.com/movies/monthly-uid

      (dry-run: 投稿していません)"
    `);
    expect(markLinksAnnounced).not.toHaveBeenCalled();
  });

  it('--monthly-links は未紹介のものが無ければ投稿しない', async () => {
    vi.mocked(findUnannouncedMonthlyLinks).mockResolvedValue(undefined);

    const output = await runCli('--monthly-links', '--dry-run');

    expect(output).toBe('投稿するものがありません');
  });

  it('--quiz で今日のクイズを告知する', async () => {
    const output = await runCli('--quiz', '--dry-run');

    expect(output).toMatchInlineSnapshot(`
      "--- Bluesky投稿内容 ---
      今日の映画クイズ（9/13）
      ポスターの一部と5つのヒントから、今日の1本を当てる。
      受賞作3,150本から毎日1問。
      #青空映画部
      --- リンクカード ---
      uri:   https://shine-film.com/quiz?d=2026-09-13
      title: 今日の映画クイズ | SHINE
      thumb: https://shine-film.com/og/quiz.png?date=2026-09-13
      --- X投稿内容 ---
      今日の映画クイズ（9/13）
      ポスターの一部と5つのヒントから、今日の1本を当てる。
      受賞作3,150本から毎日1問。
      shine-film.com/quiz?d=2026-09-13

      (dry-run: 投稿していません)"
    `);
  });

  it('--watched で今週の観た映画チェックを告知する', async () => {
    const output = await runCli('--watched', '--dry-run');

    expect(output).toMatchInlineSnapshot(`
      "--- Bluesky投稿内容 ---
      今週の観た映画チェック
      ゴールデングローブ賞 作品賞の歴代受賞作4本、何本観た？
      チェックを付けて結果を共有できます。
      #青空映画部
      --- リンクカード ---
      uri:   https://shine-film.com/watched/golden-globe-best-picture
      title: ゴールデングローブ賞 作品賞受賞作、何本観た？ | SHINE
      thumb: https://shine-film.com/og/watched.png?slug=golden-globe-best-picture
      --- X投稿内容 ---
      今週の観た映画チェック
      ゴールデングローブ賞 作品賞の歴代受賞作4本、何本観た？
      チェックを付けて結果を共有できます。
      shine-film.com/watched/golden-globe-best-picture

      (dry-run: 投稿していません)"
    `);
  });

  it('--person で今週の映画人を紹介する', async () => {
    const output = await runCli('--person', '--dry-run');

    expect(output).toMatchInlineSnapshot(`
      "--- Bluesky投稿内容 ---
      今週の映画人 — 舛田利雄（監督）
      監督賞・演技賞で3回受賞 / 5回ノミネート
      代表作: 『社葬』(1989)
      #青空映画部
      --- リンクカード ---
      uri:   https://shine-film.com/people/person-b
      title: 舛田利雄の映画 | SHINE
      thumb: https://shine-film.com/og/person.png?id=person-b
      --- X投稿内容 ---
      今週の映画人 — 舛田利雄（監督）
      監督賞・演技賞で3回受賞 / 5回ノミネート
      代表作: 『社葬』(1989)
      shine-film.com/people/person-b

      (dry-run: 投稿していません)"
    `);
  });

  it('--announce <name> で告知ファイルの本文を出す', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(announcement));

    const output = await runCli(
      '--announce',
      'venice-golden-lion',
      '--dry-run',
    );

    expect(vi.mocked(fs.readFile).mock.calls[0][0]).toMatch(
      /data\/sns-announcements\/venice-golden-lion\.json$/,
    );
    expect(output).toMatchInlineSnapshot(`
      "--- Bluesky投稿内容 ---
      第83回ヴェネツィア国際映画祭、金獅子賞は『Woman Unknown』。
      #青空映画部
      --- リンクカード ---
      uri:   https://shine-film.com/awards/venice-golden-lion/2026
      title: 第83回ヴェネツィア国際映画祭 金獅子賞（2026年） | SHINE
      thumb: https://shine-film.com/og/movie.png?id=venice-uid
      --- X投稿内容 ---
      第83回ヴェネツィア国際映画祭、金獅子賞は『Woman Unknown』。
      shine-film.com/awards/venice-golden-lion/2026

      (dry-run: 投稿していません)"
    `);
  });

  it('--announce の告知名が無ければ失敗する', async () => {
    await runCli('--announce', '--dry-run');

    expect(errorOutput()).toContain('--announce には告知名を指定してください');
    expect(process.exitCode).toBe(1);
  });

  it('--announce の告知名に記号があれば失敗する', async () => {
    await runCli('--announce', '../secret', '--dry-run');

    expect(errorOutput()).toContain('告知名が不正です: ../secret');
    expect(process.exitCode).toBe(1);
  });

  it('選出が無ければ失敗する', async () => {
    stubFetch(buildRoutes({'/?locale=ja': {}}));

    await runCli('--dry-run');

    expect(errorOutput()).toContain('No daily selection found');
    expect(process.exitCode).toBe(1);
  });
});

describe('sns-post 実投稿', () => {
  beforeEach(() => {
    vi.stubEnv('BLUESKY_IDENTIFIER', 'shine-film.com');
    vi.stubEnv('BLUESKY_APP_PASSWORD', 'app-password');
    vi.stubEnv('X_API_KEY', 'key');
    vi.stubEnv('X_API_KEY_SECRET', 'key-secret');
    vi.stubEnv('X_ACCESS_TOKEN', 'token');
    vi.stubEnv('X_ACCESS_TOKEN_SECRET', 'token-secret');
    vi.mocked(createSession).mockResolvedValue({
      did: 'did:plc:test',
      accessJwt: 'jwt',
    });
    vi.mocked(uploadBlob).mockResolvedValue({
      $type: 'blob',
      ref: {$link: 'ref'},
      mimeType: 'image/png',
      size: 3,
    });
    vi.mocked(publishPost).mockResolvedValue({uri: 'at://did:plc:test/post/1'});
    vi.mocked(postTweet).mockResolvedValue({id: '123'});
    vi.mocked(findUnannouncedMonthlyLinks).mockResolvedValue({
      movieUid: 'monthly-uid',
      title: 'ぬいぐるみとしゃべる人はやさしい',
      year: 2023,
      linkUids: ['link-1', 'link-2', 'link-3'],
    });
  });

  it('Bluesky には本文とリンクカードとサムネイルを投稿する', async () => {
    await runCli('--quiz');

    const [session, record] = vi.mocked(publishPost).mock.calls[0];
    expect(session).toEqual({did: 'did:plc:test', accessJwt: 'jwt'});
    expect(record.text).toContain('今日の映画クイズ');
    expect(record.createdAt).toBe('2026-09-13T03:00:00.000Z');
    expect(record.embed.external).toMatchObject({
      uri: 'https://shine-film.com/quiz?d=2026-09-13',
      thumb: {mimeType: 'image/png'},
    });
  });

  it('X には X 用の本文を投稿する', async () => {
    await runCli('--quiz');

    expect(postTweet).toHaveBeenCalledWith(
      {
        consumerKey: 'key',
        consumerSecret: 'key-secret',
        accessToken: 'token',
        accessTokenSecret: 'token-secret',
      },
      expect.stringContaining('shine-film.com/quiz?d=2026-09-13'),
    );
  });

  it('両方に投稿できたら投稿先を出して afterPost を呼ぶ', async () => {
    const output = await runCli('--monthly-links');

    expect(output).toContain('Bluesky: 投稿しました at://did:plc:test/post/1');
    expect(output).toContain('X: 投稿しました https://x.com/i/status/123');
    expect(markLinksAnnounced).toHaveBeenCalledWith({}, [
      'link-1',
      'link-2',
      'link-3',
    ]);
    expect(process.exitCode).toBeUndefined();
  });

  it('Bluesky が失敗しても X には投稿し、失敗として終わる', async () => {
    vi.mocked(publishPost).mockRejectedValue(new Error('bluesky down'));

    await runCli('--monthly-links');

    expect(postTweet).toHaveBeenCalledTimes(1);
    expect(markLinksAnnounced).toHaveBeenCalledTimes(1);
    expect(errorOutput()).toContain('Bluesky: 投稿に失敗しました');
    expect(errorOutput()).toContain('1件の投稿が失敗しました');
    expect(process.exitCode).toBe(1);
  });

  it('X が失敗しても Bluesky には投稿し、失敗として終わる', async () => {
    vi.mocked(postTweet).mockRejectedValue(new Error('x down'));

    await runCli('--monthly-links');

    expect(publishPost).toHaveBeenCalledTimes(1);
    expect(markLinksAnnounced).toHaveBeenCalledTimes(1);
    expect(errorOutput()).toContain('X: 投稿に失敗しました');
    expect(process.exitCode).toBe(1);
  });

  it('両方失敗したら afterPost を呼ばない', async () => {
    vi.mocked(publishPost).mockRejectedValue(new Error('bluesky down'));
    vi.mocked(postTweet).mockRejectedValue(new Error('x down'));

    await runCli('--monthly-links');

    expect(markLinksAnnounced).not.toHaveBeenCalled();
    expect(errorOutput()).toContain('2件の投稿が失敗しました');
    expect(process.exitCode).toBe(1);
  });

  it('認証情報が無いサービスはスキップする', async () => {
    vi.stubEnv('BLUESKY_IDENTIFIER', undefined);
    vi.stubEnv('X_ACCESS_TOKEN_SECRET', undefined);

    const output = await runCli('--quiz');

    expect(output).toContain('Bluesky: 認証情報が無いためスキップします');
    expect(output).toContain('X: 認証情報が無いためスキップします');
    expect(publishPost).not.toHaveBeenCalled();
    expect(postTweet).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it('OG 画像が取れなければサムネイル無しで Bluesky に投稿する', async () => {
    stubFetch(buildRoutes(), {ogImageStatus: 404});

    await runCli('--quiz');

    expect(uploadBlob).not.toHaveBeenCalled();
    const [, record] = vi.mocked(publishPost).mock.calls[0];
    expect(record.embed.external).not.toHaveProperty('thumb');
  });
});
