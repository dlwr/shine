import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import Search, { loader, meta } from './search';
import type { Route } from './+types/search';

// fetchのモック
globalThis.fetch = vi.fn();

// Cloudflare環境のモック
const createMockContext = (apiUrl = 'http://localhost:8787') => ({
  cloudflare: {
    env: {
      PUBLIC_API_URL: apiUrl
    }
  }
});

// 検索結果のモックデータ
const mockSearchResults = {
  movies: [
    {
      movieUid: 'movie-1',
      movie: {
        imdbId: 'tt1234567',
        year: 2023,
        duration: 120
      },
      translations: [
        {
          languageCode: 'ja',
          content: '検索結果映画1'
        }
      ],
      posterUrls: [
        {
          url: 'https://example.com/poster1.jpg',
          isPrimary: true
        }
      ]
    },
    {
      movieUid: 'movie-2',
      movie: {
        imdbId: 'tt7654321',
        year: 2022,
        duration: 110
      },
      translations: [
        {
          languageCode: 'ja',
          content: '検索結果映画2'
        }
      ],
      posterUrls: []
    }
  ],
  pagination: {
    page: 1,
    limit: 20,
    total: 2,
    totalPages: 1
  }
};

describe('Search Component', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('loader', () => {
    it('検索クエリありの場合は検索結果を取得する', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSearchResults
      } as Response);

      const context = createMockContext();
      const url = new URL('http://localhost:3000/search?q=test');
      const request = { url } as Request;

      const result = await loader({ context, request } as Route.LoaderArgs);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8787/movies/search?q=test&page=1&limit=20'
      );
      expect(result).toEqual({
        searchQuery: 'test',
        searchResults: mockSearchResults
      });
    });

    it('検索クエリなしの場合は空の結果を返す', async () => {
      const context = createMockContext();
      const url = new URL('http://localhost:3000/search');
      const request = { url } as Request;

      const result = await loader({ context, request } as Route.LoaderArgs);

      expect(result).toEqual({
        searchQuery: '',
        searchResults: undefined
      });
    });

    it('API接続エラーの場合はエラー情報を返す', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const context = createMockContext();
      const url = new URL('http://localhost:3000/search?q=test');
      const request = { url } as Request;

      const result = await loader({ context, request } as Route.LoaderArgs);

      expect(result).toEqual({
        searchQuery: 'test',
        error: '検索に失敗しました'
      });
    });
  });

  describe('meta', () => {
    it('検索クエリありの場合は検索クエリを含むメタデータを返す', () => {
      const loaderData = {
        searchQuery: 'test movie',
        searchResults: mockSearchResults
      };

      const result = meta({ data: loaderData } as Route.MetaArgs);

      expect(result).toEqual([
        { title: '「test movie」の検索結果 | SHINE' },
        {
          name: 'description',
          content: '「test movie」の検索結果 - SHINE映画データベース'
        }
      ]);
    });

    it('検索クエリなしの場合はデフォルトメタデータを返す', () => {
      const loaderData = {
        searchQuery: '',
        searchResults: undefined
      };

      const result = meta({ data: loaderData } as Route.MetaArgs);

      expect(result).toEqual([
        { title: '映画検索 | SHINE' },
        { name: 'description', content: 'SHINE映画データベースで映画を検索' }
      ]);
    });
  });

  describe('Component', () => {
    it('検索フォームが正常に表示される', () => {
      const loaderData = {
        searchQuery: '',
        searchResults: undefined
      };

      render(
        <Search loaderData={loaderData as Route.ComponentProps['loaderData']} />
      );

      expect(screen.getByText('映画検索')).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText('映画タイトルを入力...')
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '検索' })).toBeInTheDocument();
    });

    it('検索結果が正常に表示される', () => {
      const loaderData = {
        searchQuery: 'test',
        searchResults: mockSearchResults
      };

      render(
        <Search loaderData={loaderData as Route.ComponentProps['loaderData']} />
      );

      expect(screen.getByText('「test」の検索結果')).toBeInTheDocument();
      expect(screen.getByText('2件見つかりました')).toBeInTheDocument();
      expect(screen.getByText('検索結果映画1')).toBeInTheDocument();
      expect(screen.getByText('検索結果映画2')).toBeInTheDocument();
    });

    it('検索結果なしの場合は適切なメッセージが表示される', () => {
      const loaderData = {
        searchQuery: 'nomatch',
        searchResults: {
          movies: [],
          pagination: { page: 1, limit: 20, total: 0, totalPages: 0 }
        }
      };

      render(
        <Search loaderData={loaderData as Route.ComponentProps['loaderData']} />
      );

      expect(
        screen.getByText('検索結果が見つかりませんでした')
      ).toBeInTheDocument();
    });

    it('エラー状態が正常に表示される', () => {
      const loaderData = {
        searchQuery: 'test',
        error: '検索に失敗しました'
      };

      render(
        <Search loaderData={loaderData as Route.ComponentProps['loaderData']} />
      );

      expect(screen.getByText('検索に失敗しました')).toBeInTheDocument();
    });

    it('映画詳細ページへのリンクが正しく設定される', () => {
      const loaderData = {
        searchQuery: 'test',
        searchResults: mockSearchResults
      };

      render(
        <Search loaderData={loaderData as Route.ComponentProps['loaderData']} />
      );

      const movieLinks = screen.getAllByRole('link');
      const movieDetailLinks = movieLinks.filter((link) =>
        link.getAttribute('href')?.startsWith('/movies/')
      );

      expect(movieDetailLinks[0]).toHaveAttribute('href', '/movies/movie-1');
      expect(movieDetailLinks[1]).toHaveAttribute('href', '/movies/movie-2');
    });

    it('ホームページへの戻るリンクが表示される', () => {
      const loaderData = {
        searchQuery: '',
        searchResults: undefined
      };

      render(
        <Search loaderData={loaderData as Route.ComponentProps['loaderData']} />
      );

      const homeLink = screen.getByRole('link', { name: /ホームに戻る/ });
      expect(homeLink).toBeInTheDocument();
      expect(homeLink).toHaveAttribute('href', '/');
    });
  });
});
