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

const recommendation = (uid: string, reason: string) => ({
  uid,
  title: `${uid}の題名`,
  year: 2000,
  posterUrl: `https://example.com/${uid}.jpg`,
  reason,
});

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
    loaderData: {lists: LISTS, locale: 'ja', apiUrl: 'http://api.test'},
    params: {},
    matches: [],
  });

describe('Watched index page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
  });

  describe('loader', () => {
    it('リストの要約に団体名と賞名をつないだ見出しを付けて返す', async () => {
      mockResponse({
        lists: [
          {
            slug: 'palme-dor',
            name: 'パルム・ドール',
            organization: 'カンヌ国際映画祭',
            grouping: 'year',
            firstYear: 1955,
            lastYear: 2025,
            uids: ['uid-2022', 'uid-2023'],
          },
          {
            slug: 'kinema-junpo-japanese',
            name: '日本映画',
            organization: 'キネマ旬報ベスト・テン',
            grouping: 'year',
            firstYear: 1926,
            lastYear: 2025,
            uids: ['uid-1956'],
          },
        ],
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
    });

    it('リストは 1 回の API 呼び出しで取る', async () => {
      mockResponse({lists: []});

      await loader(createLoaderArguments());

      expect(vi.mocked(fetch).mock.calls.map(call => call[0])).toEqual([
        'http://localhost:8787/watched/lists',
      ]);
    });

    it('ブラウザから推薦を取りに行く API の URL を返す', async () => {
      mockResponse({lists: []});

      const result = await loader(createLoaderArguments());

      expect(result.apiUrl).toBe('http://localhost:8787');
    });

    it('リストの取得に失敗したら502にする', async () => {
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

      expect(descriptors).toContainEqual({title: '観た映画チェック | SHINE'});
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
    it('チェックが無ければ次の1本を取りに行かず、欄も出さない', () => {
      render(<WatchedIndexPage {...createComponentProperties()} />);

      expect(fetch).not.toHaveBeenCalled();
      expect(
        screen.queryByRole('heading', {name: '観た映画から次の1本'}),
      ).not.toBeInTheDocument();
    });

    it('最新の 20 本のチェックを送って次の1本を頼む', async () => {
      const uids = Array.from({length: 25}, (_, index) => `uid-${index}`);
      localStorage.setItem(WATCHED_STORAGE_KEY, JSON.stringify({uids}));
      mockResponse({movies: []});
      render(<WatchedIndexPage {...createComponentProperties()} />);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          `http://api.test/watched/recommendations?uids=${uids.slice(5).join(',')}`,
          expect.anything(),
        );
      });
    });

    it('次の1本を理由と一緒に出す', async () => {
      localStorage.setItem(
        WATCHED_STORAGE_KEY,
        JSON.stringify({uids: ['uid-a']}),
      );
      mockResponse({
        movies: [recommendation('uid-next', '『A』と同じ監督（小津安二郎）')],
      });
      render(<WatchedIndexPage {...createComponentProperties()} />);

      expect(
        await screen.findByText('『A』と同じ監督（小津安二郎）'),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('link', {name: /uid-nextの題名/}),
      ).toHaveAttribute('href', '/movies/uid-next');
    });

    it('観た映画を除いて 5 本まで出す', async () => {
      localStorage.setItem(
        WATCHED_STORAGE_KEY,
        JSON.stringify({uids: ['uid-a', 'uid-seen']}),
      );
      mockResponse({
        movies: [
          'uid-seen',
          'uid-1',
          'uid-2',
          'uid-3',
          'uid-4',
          'uid-5',
          'uid-6',
        ].map(uid => recommendation(uid, `${uid}の理由`)),
      });
      render(<WatchedIndexPage {...createComponentProperties()} />);

      await screen.findByText('uid-1の理由');
      expect(screen.queryByText('uid-seenの理由')).not.toBeInTheDocument();
      expect(screen.getByText('uid-5の理由')).toBeInTheDocument();
      expect(screen.queryByText('uid-6の理由')).not.toBeInTheDocument();
    });
  });
});
