import '@testing-library/jest-dom';
import {render, screen} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import DailyArchivePage, {loader, meta} from './daily';
import type {Route} from './+types/daily';
import {createMockContext} from '@/lib/test-context';

vi.stubGlobal('fetch', vi.fn());

const mockHistory = {
  items: [
    {
      uid: 'movie-1',
      title: '脱出',
      year: 1972,
      selectionDate: '2026-08-05',
    },
    {
      uid: 'movie-2',
      title: 'エンター・ザ・ボイド',
      year: 2009,
      selectionDate: '2026-08-04',
    },
    {
      uid: 'movie-3',
      title: '東への道',
      year: 1920,
      selectionDate: '2026-08-03',
    },
  ],
};

const cast = <T,>(value?: unknown): T => value as T;

type LoaderArguments = Route.LoaderArgs;
type ComponentProperties = Route.ComponentProps;

const createLoaderArguments = (
  context: unknown,
  request: Request,
): LoaderArguments =>
  cast<LoaderArguments>({
    context,
    request,
    params: {},
    matches: [],
  });

const createComponentProperties = (): ComponentProperties =>
  cast<ComponentProperties>({
    loaderData: {items: mockHistory.items, locale: 'ja'},
    params: {},
    matches: [],
  });

describe('Daily archive page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('loader', () => {
    it('APIから日次セレクション履歴を取得する', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockHistory,
      } as Response);

      const request = new Request('http://localhost:3000/daily');
      const result = await loader(
        createLoaderArguments(createMockContext(), request),
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8787/selections/daily/history?locale=ja&limit=30',
        {signal: request.signal},
      );
      expect(result).toEqual({items: mockHistory.items, locale: 'ja'});
    });

    it('APIが失敗したら502を投げる', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response);

      const request = new Request('http://localhost:3000/daily');

      await expect(
        loader(createLoaderArguments(createMockContext(), request)),
      ).rejects.toMatchObject({status: 502});
    });
  });

  describe('meta', () => {
    it('タイトルとdescriptionを返す', () => {
      const result = meta(
        cast<Route.MetaArgs>({
          loaderData: {items: mockHistory.items, locale: 'ja'},
          params: {},
          location: {
            pathname: '/daily',
            search: '',
            hash: '',
            state: undefined,
            key: 'daily-test',
          },
          matches: [],
        }),
      );

      expect(result).toContainEqual({
        title: '今日の1本 アーカイブ | なんか見る',
      });
    });
  });

  describe('component', () => {
    it('映画タイトルと詳細ページへのリンクを表示する', () => {
      render(<DailyArchivePage {...createComponentProperties()} />);

      const link = screen.getByRole('link', {name: /脱出/});
      expect(link).toHaveAttribute('href', '/movies/movie-1');
    });

    it('セレクション日付を表示する', () => {
      render(<DailyArchivePage {...createComponentProperties()} />);

      expect(screen.getByText('2026-08-05')).toBeInTheDocument();
    });

    it('全アイテムを表示する', () => {
      render(<DailyArchivePage {...createComponentProperties()} />);

      expect(screen.getAllByRole('link', {name: /『/})).toHaveLength(3);
    });

    it('他のアーカイブへのリンクを表示する', () => {
      render(<DailyArchivePage {...createComponentProperties()} />);

      expect(screen.getByRole('link', {name: 'WEEKLY'})).toHaveAttribute(
        'href',
        '/weekly',
      );
      expect(screen.getByRole('link', {name: 'MONTHLY'})).toHaveAttribute(
        'href',
        '/monthly',
      );
    });
  });
});
