import '@testing-library/jest-dom';
import {render, screen} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import WeeklyArchivePage, {loader, meta} from './weekly';
import type {Route} from './+types/weekly';

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
      selectionDate: '2026-08-07',
    },
    {
      uid: 'movie-2',
      title: 'エンター・ザ・ボイド',
      year: 2009,
      selectionDate: '2026-07-31',
    },
    {
      uid: 'movie-3',
      title: '東への道',
      year: 1920,
      selectionDate: '2026-07-24',
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

describe('Weekly archive page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('loader', () => {
    it('APIから週次セレクション履歴を取得する', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockHistory,
      } as Response);

      const request = new Request('http://localhost:3000/weekly');
      const result = await loader(
        createLoaderArguments(createMockContext(), request),
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8787/selections/weekly/history?locale=ja&limit=30',
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

      const request = new Request('http://localhost:3000/weekly');

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
            pathname: '/weekly',
            search: '',
            hash: '',
            state: undefined,
            key: 'weekly-test',
          },
          matches: [],
        }),
      );

      expect(result).toContainEqual({title: '今週の1本 アーカイブ | SHINE'});
    });
  });

  describe('component', () => {
    it('映画タイトルと詳細ページへのリンクを表示する', () => {
      render(<WeeklyArchivePage {...createComponentProperties()} />);

      const link = screen.getByRole('link', {name: /脱出/});
      expect(link).toHaveAttribute('href', '/movies/movie-1');
    });

    it('週の開始日を表示する', () => {
      render(<WeeklyArchivePage {...createComponentProperties()} />);

      expect(screen.getByText('2026-08-07')).toBeInTheDocument();
    });

    it('他のアーカイブへのリンクを表示する', () => {
      render(<WeeklyArchivePage {...createComponentProperties()} />);

      expect(screen.getByRole('link', {name: 'DAILY'})).toHaveAttribute(
        'href',
        '/daily',
      );
      expect(screen.getByRole('link', {name: 'MONTHLY'})).toHaveAttribute(
        'href',
        '/monthly',
      );
    });
  });
});
