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
  });
});
