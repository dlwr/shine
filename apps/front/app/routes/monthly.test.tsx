import '@testing-library/jest-dom';
import {render, screen} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import MonthlyArchivePage, {loader, meta} from './monthly';
import type {Route} from './+types/monthly';

globalThis.fetch = vi.fn();

const createMockContext = (apiUrl = 'http://localhost:8787') => ({
  cloudflare: {
    env: {
      PUBLIC_API_URL: apiUrl,
    },
  },
});

const mockHistory = {
  items: [
    {
      uid: 'movie-1',
      title: '脱出',
      year: 1972,
      selectionDate: '2026-08-01',
    },
    {
      uid: 'movie-2',
      title: 'エンター・ザ・ボイド',
      year: 2009,
      selectionDate: '2026-07-01',
    },
    {
      uid: 'movie-3',
      title: '東への道',
      year: 1920,
      selectionDate: '2026-06-01',
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

describe('Monthly archive page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('loader', () => {
    it('APIから月次セレクション履歴を取得する', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockHistory,
      } as Response);

      const request = new Request('http://localhost:3000/monthly');
      const result = await loader(
        createLoaderArguments(createMockContext(), request),
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8787/selections/monthly/history?locale=ja&limit=30',
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

      const request = new Request('http://localhost:3000/monthly');

      await expect(
        loader(createLoaderArguments(createMockContext(), request)),
      ).rejects.toMatchObject({status: 502});
    });
  });

  describe('meta', () => {
    it('タイトルとdescriptionを返す', () => {
      const result = meta(
        cast<Route.MetaArgs>({
          data: {items: mockHistory.items, locale: 'ja'},
          params: {},
          location: {
            pathname: '/monthly',
            search: '',
            hash: '',
            state: undefined,
            key: 'monthly-test',
          },
          matches: [],
        }),
      );

      expect(result).toContainEqual({title: '今月の1本 アーカイブ | SHINE'});
    });
  });

  describe('component', () => {
    it('映画タイトルと詳細ページへのリンクを表示する', () => {
      render(<MonthlyArchivePage {...createComponentProperties()} />);

      const link = screen.getByRole('link', {name: /脱出/});
      expect(link).toHaveAttribute('href', '/movies/movie-1');
    });

    it('月をYYYY-MM形式で表示する', () => {
      render(<MonthlyArchivePage {...createComponentProperties()} />);

      expect(screen.getByText('2026-08')).toBeInTheDocument();
      expect(screen.queryByText('2026-08-01')).not.toBeInTheDocument();
    });

    it('他のアーカイブへのリンクを表示する', () => {
      render(<MonthlyArchivePage {...createComponentProperties()} />);

      expect(screen.getByRole('link', {name: 'DAILY'})).toHaveAttribute(
        'href',
        '/daily',
      );
      expect(screen.getByRole('link', {name: 'WEEKLY'})).toHaveAttribute(
        'href',
        '/weekly',
      );
    });
  });
});
