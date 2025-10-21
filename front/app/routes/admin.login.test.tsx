import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Route } from '../../.react-router/types/app/routes/+types/admin.login';
import AdminLogin, { action, meta } from './admin.login';

type AdminLoginComponentProps = Route.ComponentProps;

// UseNavigateのモック
const mockNavigate = vi.fn();
vi.mock('react-router', () => ({
	useNavigate: () => mockNavigate,
}));

// LocalStorageのモック
const mockLocalStorage = {
	getItem: vi.fn(),
	setItem: vi.fn(),
	removeItem: vi.fn(),
	clear: vi.fn(),
};

Object.defineProperty(globalThis, 'localStorage', {
	value: mockLocalStorage,
	writable: true,
});

// Fetchのモック
globalThis.fetch = vi.fn();

// HTMLFormElement.prototype.requestSubmitのモック（JSdomで未実装）
Object.defineProperty(HTMLFormElement.prototype, 'requestSubmit', {
	value: vi.fn(function (this: HTMLFormElement) {
		const event = new Event('submit', {cancelable: true, bubbles: true});
		this.dispatchEvent(event);
	}),
	writable: true,
	configurable: true,
});

// Cloudflare環境のモック
const createMockContext = (apiUrl = 'http://localhost:8787') => ({
	cloudflare: {
		env: {
			PUBLIC_API_URL: apiUrl,
		},
	},
});

describe('AdminLogin Component', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mockNavigate.mockClear();
		// LocalStorage.getItemが既存トークンなしを返すようにセット
		mockLocalStorage.getItem.mockReturnValue(undefined);
	});

	describe('action', () => {
		it('正しいパスワードでログイン成功', async () => {
			const mockFetch = vi.mocked(fetch);
			const mockToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.token';

			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({token: mockToken}),
			} as Response);

			const formData = new FormData();
			formData.append('password', 'admin123');

			const context = createMockContext();
			const request = {formData: async () => formData} as Request;

			const result = await action({
				context,
				request,
				params: {},
			} as Route.ActionArgs);

			expect(mockFetch).toHaveBeenCalledWith(
				'http://localhost:8787/auth/login',
				{
					method: 'POST',
					headers: {'Content-Type': 'application/json'},
					body: JSON.stringify({password: 'admin123'}),
				},
			);

			expect(result).toEqual({
				success: true,
				token: mockToken,
			});
		});

		it('間違ったパスワードでログイン失敗', async () => {
			const mockFetch = vi.mocked(fetch);

			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 401,
				json: async () => ({error: 'Invalid password'}),
			} as Response);

			const formData = new FormData();
			formData.append('password', 'wrongpassword');

			const context = createMockContext();
			const request = {formData: async () => formData} as Request;

			const result = await action({
				context,
				request,
				params: {},
			} as Route.ActionArgs);

			expect(result).toEqual({
				error: 'パスワードが正しくありません',
			});
		});

		it('API接続エラーの場合', async () => {
			const mockFetch = vi.mocked(fetch);
			mockFetch.mockRejectedValueOnce(new Error('Network error'));

			const formData = new FormData();
			formData.append('password', 'admin123');

			const context = createMockContext();
			const request = {formData: async () => formData} as Request;

			const result = await action({
				context,
				request,
				params: {},
			} as Route.ActionArgs);

			expect(result).toEqual({
				error: 'ログインに失敗しました',
			});
		});
	});

		describe('meta', () => {
			it('正しいメタデータを返す', () => {
				const result = meta();

				expect(result).toEqual([
				{title: '管理者ログイン | SHINE'},
				{name: 'description', content: 'SHINE管理画面へのログイン'},
			]);
		});
	});

	describe('Component', () => {
		it('ログインフォームが正常に表示される', () => {
			const actionData: AdminLoginComponentProps['actionData'] = undefined;

			render(
				<MemoryRouter initialEntries={['/admin/login']}>
						<AdminLogin
							actionData={actionData}
						loaderData={{}}
						params={{}}
						matches={[
					{
						id: 'root',
						params: {},
						pathname: '/',
						data: undefined,
						handle: undefined,
					},
					{
						id: 'routes/admin.login',
						params: {},
						pathname: '/admin/login',
						data: {} as AdminLoginComponentProps['loaderData'],
						handle: undefined,
					},
						]}
					/>
				</MemoryRouter>,
			);

			expect(screen.getByText('管理者ログイン')).toBeInTheDocument();
			expect(screen.getByLabelText('パスワード')).toBeInTheDocument();
			const loginButtons = screen.getAllByRole('button', {name: 'ログイン'});
			expect(loginButtons).toHaveLength(1);
			expect(loginButtons[0]).toBeInTheDocument();
		});

		it('エラーメッセージが表示される', () => {
		const actionData: AdminLoginComponentProps['actionData'] = {
				error: 'パスワードが正しくありません',
			};

			render(
				<MemoryRouter initialEntries={['/admin/login']}>
						<AdminLogin
							actionData={actionData}
						loaderData={{}}
						params={{}}
						matches={[
					{
						id: 'root',
						params: {},
						pathname: '/',
						data: undefined,
						handle: undefined,
					},
					{
						id: 'routes/admin.login',
						params: {},
						pathname: '/admin/login',
						data: {} as AdminLoginComponentProps['loaderData'],
						handle: undefined,
					},
						]}
					/>
				</MemoryRouter>,
			);

			expect(
				screen.getByText('パスワードが正しくありません'),
			).toBeInTheDocument();
		});

		it('ログイン成功時にlocalStorageにトークンを保存し、リダイレクトする', async () => {
		const actionData: AdminLoginComponentProps['actionData'] = {
				success: true,
				token: 'test-token',
			};

			render(
				<MemoryRouter initialEntries={['/admin/login']}>
						<AdminLogin
							actionData={actionData}
						loaderData={{}}
						params={{}}
						matches={[
					{
						id: 'root',
						params: {},
						pathname: '/',
						data: undefined,
						handle: undefined,
					},
					{
						id: 'routes/admin.login',
						params: {},
						pathname: '/admin/login',
						data: {} as AdminLoginComponentProps['loaderData'],
						handle: undefined,
					},
						]}
					/>
				</MemoryRouter>,
			);

			await waitFor(() => {
				expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
					'adminToken',
					'test-token',
				);
				expect(mockNavigate).toHaveBeenCalledWith('/admin/movies', {
					replace: true,
				});
			});
		});

		it('既にログイン済みの場合は管理画面にリダイレクトする', () => {
			mockLocalStorage.getItem.mockReturnValue('existing-token');

			const actionData: AdminLoginComponentProps['actionData'] = undefined;
			render(
				<MemoryRouter initialEntries={['/admin/login']}>
						<AdminLogin
							actionData={actionData}
						loaderData={{}}
						params={{}}
						matches={[
					{
						id: 'root',
						params: {},
						pathname: '/',
						data: undefined,
						handle: undefined,
					},
					{
						id: 'routes/admin.login',
						params: {},
						pathname: '/admin/login',
						data: {} as AdminLoginComponentProps['loaderData'],
						handle: undefined,
					},
						]}
					/>
				</MemoryRouter>,
			);

			expect(mockNavigate).toHaveBeenCalledWith('/admin/movies', {
				replace: true,
			});
		});

		it('フォーム送信が正常に動作する', async () => {
			const actionData: AdminLoginComponentProps['actionData'] = undefined;

			render(
				<MemoryRouter initialEntries={['/admin/login']}>
						<AdminLogin
							actionData={actionData}
						loaderData={{}}
						params={{}}
						matches={[
					{
						id: 'root',
						params: {},
						pathname: '/',
						data: undefined,
						handle: undefined,
					},
					{
						id: 'routes/admin.login',
						params: {},
						pathname: '/admin/login',
						data: {} as AdminLoginComponentProps['loaderData'],
						handle: undefined,
					},
						]}
					/>
				</MemoryRouter>,
			);

			const passwordInput = screen.getByLabelText('パスワード');
			const submitButtons = screen.getAllByRole('button', {name: 'ログイン'});
			expect(submitButtons.length).toBeGreaterThanOrEqual(1);
			const submitButton = submitButtons[0];

			fireEvent.change(passwordInput, {target: {value: 'admin123'}});
			fireEvent.click(submitButton);

			expect(passwordInput).toHaveValue('admin123');
		});

		it('ホームページへの戻るリンクが表示される', () => {
			const actionData: AdminLoginComponentProps['actionData'] = undefined;

			render(
				<MemoryRouter initialEntries={['/admin/login']}>
						<AdminLogin
							actionData={actionData}
						loaderData={{}}
						params={{}}
						matches={[
					{
						id: 'root',
						params: {},
						pathname: '/',
						data: undefined,
						handle: undefined,
					},
					{
						id: 'routes/admin.login',
						params: {},
						pathname: '/admin/login',
						data: {} as AdminLoginComponentProps['loaderData'],
						handle: undefined,
					},
						]}
					/>
				</MemoryRouter>,
			);

			const homeLinks = screen.getAllByRole('link', {name: /ホームに戻る/});
			expect(homeLinks.length).toBeGreaterThanOrEqual(1);
			expect(homeLinks[0]).toBeInTheDocument();
			expect(homeLinks[0]).toHaveAttribute('href', '/');
		});
	});
});
