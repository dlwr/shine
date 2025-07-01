/* eslint-disable unicorn/no-null, @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import AdminLogin, { action, meta } from './admin.login';
import type { Route } from './+types/admin.login';

// useNavigateのモック
const mockNavigate = vi.fn();
vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate
}));

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

describe('AdminLogin Component', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockNavigate.mockClear();
    // localStorage.getItemが既存トークンなしを返すようにセット
    mockLocalStorage.getItem.mockReturnValue(null);
  });

  describe('action', () => {
    it('正しいパスワードでログイン成功', async () => {
      const mockFetch = vi.mocked(fetch);
      const mockToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.token';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: mockToken })
      } as Response);

      const formData = new FormData();
      formData.append('password', 'admin123');

      const context = createMockContext();
      const request = { formData: async () => formData } as Request;

      const result = await action({ context, request } as Route.ActionArgs);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8787/auth/login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: 'admin123' })
        }
      );

      expect(result).toEqual({
        success: true,
        token: mockToken
      });
    });

    it('間違ったパスワードでログイン失敗', async () => {
      const mockFetch = vi.mocked(fetch);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Invalid password' })
      } as Response);

      const formData = new FormData();
      formData.append('password', 'wrongpassword');

      const context = createMockContext();
      const request = { formData: async () => formData } as Request;

      const result = await action({ context, request } as Route.ActionArgs);

      expect(result).toEqual({
        error: 'パスワードが正しくありません'
      });
    });

    it('API接続エラーの場合', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const formData = new FormData();
      formData.append('password', 'admin123');

      const context = createMockContext();
      const request = { formData: async () => formData } as Request;

      const result = await action({ context, request } as Route.ActionArgs);

      expect(result).toEqual({
        error: 'ログインに失敗しました'
      });
    });
  });

  describe('meta', () => {
    it('正しいメタデータを返す', () => {
      const result = meta();

      expect(result).toEqual([
        { title: '管理者ログイン | SHINE' },
        { name: 'description', content: 'SHINE管理画面へのログイン' }
      ]);
    });
  });

  describe('Component', () => {
    it('ログインフォームが正常に表示される', () => {
      const actionData = {};

      render(
        <MemoryRouter initialEntries={['/admin/login']}>
          <AdminLogin
            actionData={actionData as any}
            loaderData={{}}
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
                id: 'routes/admin.login',
                params: {},
                pathname: '/admin/login',
                data: undefined,
                handle: undefined
              }
            ]}
          />
        </MemoryRouter>
      );

      expect(screen.getByText('管理者ログイン')).toBeInTheDocument();
      expect(screen.getByLabelText('パスワード')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'ログイン' })
      ).toBeInTheDocument();
    });

    it('エラーメッセージが表示される', () => {
      const actionData = {
        error: 'パスワードが正しくありません'
      };

      render(
        <MemoryRouter initialEntries={['/admin/login']}>
          <AdminLogin
            actionData={actionData as any}
            loaderData={{}}
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
                id: 'routes/admin.login',
                params: {},
                pathname: '/admin/login',
                data: undefined,
                handle: undefined
              }
            ]}
          />
        </MemoryRouter>
      );

      expect(
        screen.getByText('パスワードが正しくありません')
      ).toBeInTheDocument();
    });

    it('ログイン成功時にlocalStorageにトークンを保存し、リダイレクトする', async () => {
      const actionData = {
        success: true,
        token: 'test-token'
      };

      render(
        <MemoryRouter initialEntries={['/admin/login']}>
          <AdminLogin
            actionData={actionData as any}
            loaderData={{}}
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
                id: 'routes/admin.login',
                params: {},
                pathname: '/admin/login',
                data: undefined,
                handle: undefined
              }
            ]}
          />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
          'adminToken',
          'test-token'
        );
        expect(mockNavigate).toHaveBeenCalledWith('/admin/movies', {
          replace: true
        });
      });
    });

    it('既にログイン済みの場合は管理画面にリダイレクトする', () => {
      mockLocalStorage.getItem.mockReturnValue('existing-token');

      const actionData = {};
      render(
        <MemoryRouter initialEntries={['/admin/login']}>
          <AdminLogin
            actionData={actionData as any}
            loaderData={{}}
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
                id: 'routes/admin.login',
                params: {},
                pathname: '/admin/login',
                data: undefined,
                handle: undefined
              }
            ]}
          />
        </MemoryRouter>
      );

      expect(mockNavigate).toHaveBeenCalledWith('/admin/movies', {
        replace: true
      });
    });

    it('フォーム送信が正常に動作する', async () => {
      const actionData = {};

      render(
        <MemoryRouter initialEntries={['/admin/login']}>
          <AdminLogin
            actionData={actionData as any}
            loaderData={{}}
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
                id: 'routes/admin.login',
                params: {},
                pathname: '/admin/login',
                data: undefined,
                handle: undefined
              }
            ]}
          />
        </MemoryRouter>
      );

      const passwordInput = screen.getByLabelText('パスワード');
      const submitButton = screen.getByRole('button', { name: 'ログイン' });

      fireEvent.change(passwordInput, { target: { value: 'admin123' } });
      fireEvent.click(submitButton);

      expect(passwordInput).toHaveValue('admin123');
    });

    it('ホームページへの戻るリンクが表示される', () => {
      const actionData = {};

      render(
        <MemoryRouter initialEntries={['/admin/login']}>
          <AdminLogin
            actionData={actionData as any}
            loaderData={{}}
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
                id: 'routes/admin.login',
                params: {},
                pathname: '/admin/login',
                data: undefined,
                handle: undefined
              }
            ]}
          />
        </MemoryRouter>
      );

      const homeLink = screen.getByRole('link', { name: /ホームに戻る/ });
      expect(homeLink).toBeInTheDocument();
      expect(homeLink).toHaveAttribute('href', '/');
    });
  });
});
