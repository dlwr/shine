/* eslint-disable @typescript-eslint/no-explicit-any, unicorn/no-null */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import AdminMovies, { loader, meta } from './admin.movies';
// import type { Route } from './+types/admin.movies';

// LocalStorageのモック
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
};

Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  writable: true
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
      uid: 'movie-1',
      title: 'テスト映画',
      year: 2023,
      originalLanguage: 'ja',
      posterUrl: 'https://example.com/poster1.jpg',
      imdbUrl: 'https://www.imdb.com/title/tt1234567/'
    },
    {
      uid: 'movie-2',
      title: '管理画面テスト映画',
      year: 2022,
      originalLanguage: 'ja',
      posterUrl: null,
      imdbUrl: 'https://www.imdb.com/title/tt7654321/'
    }
  ],
  pagination: {
    page: 1,
    limit: 20,
    totalCount: 2,
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
    it('URLパラメータを正しく解析して返す', async () => {
      const context = createMockContext();
      const url = new URL(
        'http://localhost:3000/admin/movies?page=2&limit=50&search=test'
      );
      const request = { url } as unknown as Request;

      const result = (await loader({
        context,
        request
      } as any)) as any;

      expect(result).toEqual({
        apiUrl: 'http://localhost:8787',
        page: 2,
        limit: 50,
        search: 'test',
        movies: [],
        pagination: { page: 1, limit: 20, totalCount: 0, totalPages: 0 }
      });
    });

    it('デフォルト値が正しく設定される', async () => {
      const context = createMockContext();
      const url = new URL('http://localhost:3000/admin/movies');
      const request = { url } as unknown as Request;

      const result = (await loader({
        context,
        request
      } as any)) as any;

      expect(result).toEqual({
        apiUrl: 'http://localhost:8787',
        page: 1,
        limit: 20,
        search: '',
        movies: [],
        pagination: { page: 1, limit: 20, totalCount: 0, totalPages: 0 }
      });
    });

    it('カスタムAPIURLが正しく設定される', async () => {
      const context = createMockContext('https://api.example.com');
      const url = new URL('http://localhost:3000/admin/movies');
      const request = { url } as unknown as Request;

      const result = (await loader({
        context,
        request
      } as any)) as any;

      expect(result.apiUrl).toBe('https://api.example.com');
    });
  });

  describe('meta', () => {
    it('正しいメタデータを返す', () => {
      const result = meta();

      expect(result).toEqual([
        { title: '映画管理 | SHINE Admin' },
        { name: 'description', content: '映画データベースの管理画面' }
      ]);
    });
  });

  describe('Component', () => {
    it('ローディング状態が表示される', () => {
      render(
        <AdminMovies
          loaderData={
            {
              apiUrl: 'http://localhost:8787',
              page: 1,
              limit: 20,
              search: '',
              movies: [],
              pagination: { page: 1, limit: 20, totalCount: 0, totalPages: 0 }
            } as any
          }
          actionData={{} as any}
          params={{}}
          matches={[
            {
              id: 'root',
              params: {},
              pathname: '/',
              data: undefined,
              handle: undefined
            },
            {
              id: 'routes/admin.movies',
              params: {},
              pathname: '/admin/movies',
              data: undefined,
              handle: undefined
            }
          ]}
        />
      );

      expect(screen.getByText('Loading movies...')).toBeInTheDocument();
    });

    it('映画がない場合のメッセージが表示される', () => {
      // localStorageをセットアップ
      mockLocalStorage.getItem.mockReturnValue('valid-admin-token');

      // fetchをモック
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          movies: [],
          pagination: { page: 1, limit: 20, totalCount: 0, totalPages: 0 }
        })
      } as Response);

      render(
        <AdminMovies
          loaderData={
            {
              apiUrl: 'http://localhost:8787',
              page: 1,
              limit: 20,
              search: '',
              movies: [],
              pagination: { page: 1, limit: 20, totalCount: 0, totalPages: 0 }
            } as any
          }
          actionData={{} as any}
          params={{}}
          matches={[
            {
              id: 'root',
              params: {},
              pathname: '/',
              data: undefined,
              handle: undefined
            },
            {
              id: 'routes/admin.movies',
              params: {},
              pathname: '/admin/movies',
              data: undefined,
              handle: undefined
            }
          ]}
        />
      );

      // 初期状態はloading
      expect(screen.getByText('Loading movies...')).toBeInTheDocument();
    });

    it('ヘッダーとナビゲーションが表示される', () => {
      render(
        <AdminMovies
          loaderData={
            {
              apiUrl: 'http://localhost:8787',
              page: 1,
              limit: 20,
              search: '',
              movies: [],
              pagination: { page: 1, limit: 20, totalCount: 0, totalPages: 0 }
            } as any
          }
          actionData={{} as any}
          params={{}}
          matches={[
            {
              id: 'root',
              params: {},
              pathname: '/',
              data: undefined,
              handle: undefined
            },
            {
              id: 'routes/admin.movies',
              params: {},
              pathname: '/admin/movies',
              data: undefined,
              handle: undefined
            }
          ]}
        />
      );

      expect(screen.getByText('Movies Management')).toBeInTheDocument();
      expect(screen.getByText('Movie Selections')).toHaveAttribute(
        'href',
        '/admin/selections'
      );
      expect(screen.getByText('Logout')).toBeInTheDocument();
    });

    it('検索入力フィールドが表示される', async () => {
      // localStorageをセットアップ
      mockLocalStorage.getItem.mockReturnValue('valid-admin-token');

      // fetchをモック
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          movies: [],
          pagination: { page: 1, limit: 20, totalCount: 0, totalPages: 0 }
        })
      } as Response);

      render(
        <AdminMovies
          loaderData={
            {
              apiUrl: 'http://localhost:8787',
              page: 1,
              limit: 20,
              search: '',
              movies: [],
              pagination: { page: 1, limit: 20, totalCount: 0, totalPages: 0 }
            } as any
          }
          actionData={{} as any}
          params={{}}
          matches={[
            {
              id: 'root',
              params: {},
              pathname: '/',
              data: undefined,
              handle: undefined
            },
            {
              id: 'routes/admin.movies',
              params: {},
              pathname: '/admin/movies',
              data: undefined,
              handle: undefined
            }
          ]}
        />
      );

      // 初期状態はloading
      expect(screen.getByText('Loading movies...')).toBeInTheDocument();

      // データがロードされるのを待つ
      const searchInput = await screen.findByPlaceholderText(
        'Search movies by title...'
      );
      expect(searchInput).toBeInTheDocument();
    });

    it('ログアウト機能が動作する', () => {
      const mockLocation = { href: '' };
      Object.defineProperty(globalThis, 'location', {
        value: mockLocation,
        writable: true
      });

      render(
        <AdminMovies
          loaderData={
            {
              apiUrl: 'http://localhost:8787',
              page: 1,
              limit: 20,
              search: '',
              movies: [],
              pagination: { page: 1, limit: 20, totalCount: 0, totalPages: 0 }
            } as any
          }
          actionData={{} as any}
          params={{}}
          matches={[
            {
              id: 'root',
              params: {},
              pathname: '/',
              data: undefined,
              handle: undefined
            },
            {
              id: 'routes/admin.movies',
              params: {},
              pathname: '/admin/movies',
              data: undefined,
              handle: undefined
            }
          ]}
        />
      );

      const logoutButton = screen.getByText('Logout');
      fireEvent.click(logoutButton);

      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('adminToken');
      expect(mockLocation.href).toBe('/admin/login');
    });

    it('ログアウト機能が動作する', () => {
      const mockLocation = { href: '' };
      Object.defineProperty(globalThis, 'location', {
        value: mockLocation,
        writable: true
      });

      render(
        <AdminMovies
          loaderData={
            {
              apiUrl: 'http://localhost:8787',
              page: 1,
              limit: 20,
              movies: [],
              pagination: { page: 1, limit: 20, total: 0, totalPages: 0 }
            } as any
          }
          actionData={{} as any}
          params={{}}
          matches={[
            {
              id: 'root',
              params: {},
              pathname: '/',
              data: undefined,
              handle: undefined
            },
            {
              id: 'routes/admin.movies',
              params: {},
              pathname: '/admin/movies',
              data: undefined,
              handle: undefined
            }
          ]}
        />
      );

      const logoutButton = screen.getByText('Logout');
      fireEvent.click(logoutButton);

      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('adminToken');
      expect(mockLocation.href).toBe('/admin/login');
    });
  });
});
