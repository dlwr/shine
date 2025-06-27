import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import AdminMovies, { loader, meta } from './admin.movies';

// LocalStorageのモック
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
});

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

// 映画リストのモックデータ
const mockMoviesList = {
  movies: [
    {
      movieUid: 'movie-1',
      movie: {
        imdbId: 'tt1234567',
        tmdbId: 123456,
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
          url: 'https://example.com/poster1.jpg',
          isPrimary: true
        }
      ]
    },
    {
      movieUid: 'movie-2',
      movie: {
        imdbId: 'tt7654321',
        tmdbId: 654321,
        year: 2022,
        duration: 110,
        createdAt: '2022-01-01T00:00:00Z',
        updatedAt: '2022-01-01T00:00:00Z'
      },
      translations: [
        {
          languageCode: 'ja',
          resourceType: 'movie_title',
          content: '管理画面テスト映画'
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

describe('AdminMovies Component', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // 認証済み状態に設定
    mockLocalStorage.getItem.mockReturnValue('valid-admin-token');
  });

  describe('loader', () => {
    it('認証済みユーザーの映画リストを正常に取得する', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockMoviesList
      } as Response);

      const context = createMockContext();
      const url = new URL('http://localhost:3000/admin/movies?page=1');
      const request = { url } as Request;
      
      const result = await loader({ context, request } as unknown as any);

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:8787/admin/movies?page=1&limit=20', {
        headers: { 'Authorization': 'Bearer valid-admin-token' }
      });
      
      expect(result).toEqual(mockMoviesList);
    });

    it('未認証の場合はログインページにリダイレクト', async () => {
      mockLocalStorage.getItem.mockReturnValue(null);

      const context = createMockContext();
      const url = new URL('http://localhost:3000/admin/movies');
      const request = { url } as Request;
      
      const result = await loader({ context, request } as unknown as any);

      expect(result.status).toBe(302);
      expect(result.headers.get('Location')).toBe('/admin/login');
    });

    it('認証エラーの場合はログインページにリダイレクト', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401
      } as Response);

      const context = createMockContext();
      const url = new URL('http://localhost:3000/admin/movies');
      const request = { url } as Request;
      
      const result = await loader({ context, request } as unknown as any);

      expect(result.status).toBe(302);
      expect(result.headers.get('Location')).toBe('/admin/login');
    });
  });

  describe('meta', () => {
    it('正しいメタデータを返す', () => {
      const result = meta();
      
      expect(result).toEqual([
        { title: "映画管理 | SHINE Admin" },
        { name: "description", content: "映画データベースの管理画面" }
      ]);
    });
  });

  describe('Component', () => {
    it('映画リストが正常に表示される', () => {
      const loaderData = mockMoviesList;
      
      render(<AdminMovies loaderData={loaderData} />);

      expect(screen.getByText('映画管理')).toBeInTheDocument();
      expect(screen.getByText('テスト映画')).toBeInTheDocument();
      expect(screen.getByText('管理画面テスト映画')).toBeInTheDocument();
      expect(screen.getByText('tt1234567')).toBeInTheDocument();
      expect(screen.getByText('2023年')).toBeInTheDocument();
    });

    it('ページネーションが表示される', () => {
      const loaderData = {
        ...mockMoviesList,
        pagination: {
          page: 2,
          limit: 20,
          total: 50,
          totalPages: 3
        }
      };
      
      render(<AdminMovies loaderData={loaderData} />);

      expect(screen.getByText('2 / 3 ページ')).toBeInTheDocument();
      expect(screen.getByText('合計: 50件')).toBeInTheDocument();
    });

    it('編集リンクが正しく設定される', () => {
      const loaderData = mockMoviesList;
      
      render(<AdminMovies loaderData={loaderData} />);

      const editLinks = screen.getAllByText('編集');
      expect(editLinks[0]).toHaveAttribute('href', '/admin/movies/movie-1');
      expect(editLinks[1]).toHaveAttribute('href', '/admin/movies/movie-2');
    });

    it('削除ボタンが表示される', () => {
      const loaderData = mockMoviesList;
      
      render(<AdminMovies loaderData={loaderData} />);

      const deleteButtons = screen.getAllByText('削除');
      expect(deleteButtons).toHaveLength(2);
    });

    it('ポスター画像が表示される（プライマリがある場合）', () => {
      const loaderData = mockMoviesList;
      
      render(<AdminMovies loaderData={loaderData} />);

      const posterImage = screen.getByAltText('テスト映画');
      expect(posterImage).toBeInTheDocument();
      expect(posterImage).toHaveAttribute('src', 'https://example.com/poster1.jpg');
    });

    it('ポスターがない場合はプレースホルダーが表示される', () => {
      const loaderData = mockMoviesList;
      
      render(<AdminMovies loaderData={loaderData} />);

      expect(screen.getByText('No Image')).toBeInTheDocument();
    });

    it('ナビゲーションリンクが表示される', () => {
      const loaderData = mockMoviesList;
      
      render(<AdminMovies loaderData={loaderData} />);

      expect(screen.getByText('ホーム')).toHaveAttribute('href', '/');
      expect(screen.getByText('ログアウト')).toBeInTheDocument();
    });

    it('ログアウト機能が動作する', () => {
      const loaderData = mockMoviesList;
      
      const mockLocation = { href: '' };
      Object.defineProperty(window, 'location', {
        value: mockLocation,
        writable: true,
      });
      
      render(<AdminMovies loaderData={loaderData} />);

      const logoutButton = screen.getByText('ログアウト');
      fireEvent.click(logoutButton);

      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('adminToken');
      expect(mockLocation.href).toBe('/admin/login');
    });
  });
});