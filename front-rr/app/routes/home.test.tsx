import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import Home, { loader, meta } from './home';
import type { Route } from './+types/home';

// Cloudflare環境のモック
const createMockContext = (apiUrl = 'http://localhost:8787') => ({
  cloudflare: {
    env: {
      PUBLIC_API_URL: apiUrl
    }
  }
});

// APIレスポンスのモック
const mockMovieSelections = {
  daily: {
    movieUid: 'movie-1',
    movie: {
      imdbId: 'tt1234567',
      tmdbId: 123_456,
      year: 2023,
      duration: 120,
      createdAt: '2023-01-01T00:00:00Z',
      updatedAt: '2023-01-01T00:00:00Z'
    },
    translations: [
      {
        languageCode: 'ja',
        resourceType: 'movie_title',
        content: 'テスト映画'
      }
    ],
    posterUrls: [
      {
        url: 'https://example.com/poster.jpg',
        width: 300,
        height: 450
      }
    ],
    nominations: [
      {
        isWinner: true,
        category: { name: 'Best Picture' },
        ceremony: { name: 'Academy Awards', year: 2023 }
      }
    ]
  },
  weekly: {
    movieUid: 'movie-2',
    movie: {
      imdbId: 'tt7654321',
      tmdbId: 654_321,
      year: 2022,
      duration: 110,
      createdAt: '2022-01-01T00:00:00Z',
      updatedAt: '2022-01-01T00:00:00Z'
    },
    translations: [
      {
        languageCode: 'ja',
        resourceType: 'movie_title',
        content: '週間映画'
      }
    ],
    posterUrls: [],
    nominations: []
  },
  monthly: {
    movieUid: 'movie-3',
    movie: {
      imdbId: 'tt9876543',
      tmdbId: 987_654,
      year: 2021,
      duration: 95,
      createdAt: '2021-01-01T00:00:00Z',
      updatedAt: '2021-01-01T00:00:00Z'
    },
    translations: [
      {
        languageCode: 'ja',
        resourceType: 'movie_title',
        content: '月間映画'
      }
    ],
    posterUrls: [],
    nominations: []
  }
};

// fetchのモック
globalThis.fetch = vi.fn();

describe('Home Component', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('loader', () => {
    it('APIから映画選択データを正常に取得する', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockMovieSelections
      } as Response);

      const context = createMockContext();
      const result = await loader({ context } as Route.LoaderArgs);

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:8787/');
      expect(result).toEqual({
        movieSelections: mockMovieSelections
      });
    });

    it('API接続エラーの場合はエラー情報を返す', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const context = createMockContext();
      const result = await loader({ context } as Route.LoaderArgs);

      expect(result).toEqual({
        error: 'APIへの接続に失敗しました'
      });
    });

    it('APIレスポンスエラーの場合はエラー情報を返す', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500
      } as Response);

      const context = createMockContext();
      const result = await loader({ context } as Route.LoaderArgs);

      expect(result).toEqual({
        error: 'データの取得に失敗しました'
      });
    });
  });

  describe('meta', () => {
    it('正しいメタデータを返す', () => {
      const result = meta();

      expect(result).toEqual([
        { title: 'SHINE - 世界最高の映画データベース' },
        {
          name: 'description',
          content:
            '日替わり・週替わり・月替わりで厳選された映画をお楽しみください。アカデミー賞、カンヌ国際映画祭、日本アカデミー賞受賞作品を含む包括的な映画データベース。'
        }
      ]);
    });
  });

  describe('Component', () => {
    it('映画選択データが正常に表示される', () => {
      const loaderData = {
        movieSelections: mockMovieSelections
      };

      render(
        <Home loaderData={loaderData as Route.ComponentProps['loaderData']} />
      );

      // 各セクションのタイトルが表示される
      expect(screen.getByText('今日の映画')).toBeInTheDocument();
      expect(screen.getByText('今週の映画')).toBeInTheDocument();
      expect(screen.getByText('今月の映画')).toBeInTheDocument();

      // 映画タイトルが表示される
      expect(screen.getByText('テスト映画')).toBeInTheDocument();
      expect(screen.getByText('週間映画')).toBeInTheDocument();
      expect(screen.getByText('月間映画')).toBeInTheDocument();
    });

    it('エラー状態が正常に表示される', () => {
      const loaderData = {
        error: 'APIへの接続に失敗しました'
      };

      render(
        <Home loaderData={loaderData as Route.ComponentProps['loaderData']} />
      );

      expect(screen.getByText('エラーが発生しました')).toBeInTheDocument();
      expect(screen.getByText('APIへの接続に失敗しました')).toBeInTheDocument();
    });

    it('受賞情報がバッジとして表示される', () => {
      const loaderData = {
        movieSelections: mockMovieSelections
      };

      render(
        <Home loaderData={loaderData as Route.ComponentProps['loaderData']} />
      );

      expect(
        screen.getByText('🏆 Academy Awards 2023 受賞')
      ).toBeInTheDocument();
    });

    it('映画詳細ページへのリンクが正しく設定される', () => {
      const loaderData = {
        movieSelections: mockMovieSelections
      };

      render(
        <Home loaderData={loaderData as Route.ComponentProps['loaderData']} />
      );

      const dailyMovieLink = screen.getByRole('link', { name: /テスト映画/ });
      expect(dailyMovieLink).toHaveAttribute('href', '/movies/movie-1');
    });
  });
});
