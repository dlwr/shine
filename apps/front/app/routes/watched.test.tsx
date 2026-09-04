import '@testing-library/jest-dom';
import {render, screen, waitFor} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import WatchedIndexPage, {loader, meta} from './watched';
import type {Route} from './+types/watched';
import {createMockContext} from '@/lib/test-context';
import {WATCHED_STORAGE_KEY} from '@/lib/watched';

vi.stubGlobal('fetch', vi.fn());

const cast = <T,>(value?: unknown): T => value as T;

const mockResponse = (body: unknown, status = 200) => {
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
};

const AWARDS = [
  {
    slug: 'palme-dor',
    name: 'パルム・ドール',
    organization: 'カンヌ国際映画祭',
    grouping: 'year',
    firstYear: 1955,
    lastYear: 2025,
  },
  {
    slug: 'cannes-grand-prix',
    name: 'グランプリ',
    organization: 'カンヌ国際映画祭',
    grouping: 'year',
    subAward: true,
    firstYear: 1967,
    lastYear: 2025,
  },
  {
    slug: '1001-movies',
    name: '死ぬまでに観たい映画1001本',
    organization: '死ぬまでに観たい映画1001本',
    grouping: 'list',
    firstYear: 2003,
    lastYear: 2003,
  },
  {
    slug: 'academy-director',
    name: '監督賞',
    organization: 'アカデミー賞',
    grouping: 'person',
    firstYear: 1929,
    lastYear: 2026,
  },
  {
    slug: 'kinema-junpo-japanese',
    name: '日本映画',
    organization: 'キネマ旬報ベスト・テン',
    grouping: 'year',
    firstYear: 1926,
    lastYear: 2025,
  },
];

const LISTS = [
  {
    slug: 'palme-dor',
    heading: 'カンヌ国際映画祭 パルム・ドール',
    firstYear: 1955,
    lastYear: 2025,
    uids: ['uid-a', 'uid-b', 'uid-shared'],
  },
  {
    slug: 'kinema-junpo-japanese',
    heading: 'キネマ旬報ベスト・テン 日本映画',
    firstYear: 1926,
    lastYear: 2025,
    uids: ['uid-c', 'uid-shared'],
  },
];

const createLoaderArguments = () =>
  cast<Route.LoaderArgs>({
    context: createMockContext(),
    request: new Request('http://localhost:3000/watched'),
    params: {},
    matches: [],
  });

const createComponentProperties = (): Route.ComponentProps =>
  cast<Route.ComponentProps>({
    loaderData: {lists: LISTS, locale: 'ja'},
    params: {},
    matches: [],
  });

describe('Watched index page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
  });

  describe('loader', () => {
    it('最高賞の年度制リストだけを受賞作の uid 付きで返す', async () => {
      mockResponse({awards: AWARDS});
      mockResponse({
        years: [
          {
            year: 2023,
            movies: [
              {uid: 'uid-2023', isWinner: true},
              {uid: 'uid-nominee', isWinner: false},
            ],
          },
          {year: 2022, movies: [{uid: 'uid-2022', isWinner: true}]},
        ],
      });
      mockResponse({
        years: [{year: 1956, movies: [{uid: 'uid-1956', isWinner: true}]}],
      });

      const result = await loader(createLoaderArguments());

      expect(result.lists).toEqual([
        {
          slug: 'palme-dor',
          heading: 'カンヌ国際映画祭 パルム・ドール',
          firstYear: 1955,
          lastYear: 2025,
          uids: ['uid-2022', 'uid-2023'],
        },
        {
          slug: 'kinema-junpo-japanese',
          heading: 'キネマ旬報ベスト・テン 日本映画',
          firstYear: 1926,
          lastYear: 2025,
          uids: ['uid-1956'],
        },
      ]);
      expect(vi.mocked(fetch).mock.calls.map(call => call[0])).toEqual([
        'http://localhost:8787/awards',
        'http://localhost:8787/awards/palme-dor',
        'http://localhost:8787/awards/kinema-junpo-japanese',
      ]);
    });

    it('賞一覧の取得に失敗したら502にする', async () => {
      mockResponse({}, 500);

      await expect(loader(createLoaderArguments())).rejects.toMatchObject({
        status: 502,
      });
    });

    it('賞ページの取得に失敗したら502にする', async () => {
      mockResponse({awards: [AWARDS[0]]});
      mockResponse({}, 500);

      await expect(loader(createLoaderArguments())).rejects.toMatchObject({
        status: 502,
      });
    });
  });

  describe('meta', () => {
    it('観た映画チェックのタイトルを返す', () => {
      const descriptors = meta(
        cast<Route.MetaArgs>({loaderData: {lists: [], locale: 'ja'}}),
      ) as Array<Record<string, string>>;

      expect(descriptors).toContainEqual({
        title: '観た映画チェック | なんか見る',
      });
      expect(descriptors).toContainEqual({
        property: 'og:url',
        content: 'https://shine-film.com/watched',
      });
    });
  });

  describe('component', () => {
    it('各リストへリンクし、重複を除いた総数を出す', () => {
      render(<WatchedIndexPage {...createComponentProperties()} />);

      expect(
        screen.getByRole('link', {name: /パルム・ドール/}),
      ).toHaveAttribute('href', '/watched/palme-dor');
      expect(
        screen.getByText('2リストの受賞作（重複を除く）'),
      ).toBeInTheDocument();
      expect(screen.getByTestId('watched-total-count')).toHaveTextContent('0');
      expect(screen.getByText('/ 4')).toBeInTheDocument();
    });

    it('保存済みのチェックからリストごとの本数と総数を出す', async () => {
      localStorage.setItem(
        WATCHED_STORAGE_KEY,
        JSON.stringify({uids: ['uid-a', 'uid-shared', 'uid-other']}),
      );
      render(<WatchedIndexPage {...createComponentProperties()} />);

      await waitFor(() => {
        expect(screen.getByTestId('watched-total-count')).toHaveTextContent(
          '2',
        );
      });
      expect(screen.getByText('50%')).toBeInTheDocument();
      expect(
        screen.getByRole('link', {name: /パルム・ドール/}),
      ).toHaveTextContent('2 / 3');
      expect(screen.getByRole('link', {name: /キネマ旬報/})).toHaveTextContent(
        '1 / 2',
      );
    });
  });
});
