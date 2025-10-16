import '@testing-library/jest-dom';
import {fireEvent, render, screen} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import AdminMovies, {loader, meta} from './admin.movies';
// Import type { Route } from './+types/admin.movies';

// UseSearchParamsのモック
const mockSearchParameters = new URLSearchParams();
const mockSetSearchParameters = vi.fn();
vi.mock('react-router', () => ({
	useSearchParams: () => [mockSearchParameters, mockSetSearchParameters],
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

// Cloudflare環境のモック
const createMockContext = (apiUrl = 'http://localhost:8787') => ({
	cloudflare: {
		env: {
			PUBLIC_API_URL: apiUrl,
		},
	},
});

// 映画リストのモックデータ
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
				'http://localhost:3000/admin/movies?page=2&limit=50&search=test',
			);
			const request = {url} as unknown as Request;

			const result = (await loader({
				context,
				request,
			} as any)) as any;

			expect(result).toEqual({
				apiUrl: 'http://localhost:8787',
				page: 2,
				limit: 50,
				search: 'test',
				movies: [],
				pagination: {
					page: 1,
					limit: 20,
					totalCount: 0,
					totalPages: 0,
				},
			});
		});

		it('デフォルト値が正しく設定される', async () => {
			const context = createMockContext();
			const url = new URL('http://localhost:3000/admin/movies');
			const request = {url} as unknown as Request;

			const result = (await loader({
				context,
				request,
			} as any)) as any;

			expect(result).toEqual({
				apiUrl: 'http://localhost:8787',
				page: 1,
				limit: 20,
				search: '',
				movies: [],
				pagination: {
					page: 1,
					limit: 20,
					totalCount: 0,
					totalPages: 0,
				},
			});
		});

		it('カスタムAPI URLが正しく設定される', async () => {
			const context = createMockContext('https://api.example.com');
			const url = new URL('http://localhost:3000/admin/movies');
			const request = {url} as unknown as Request;

			const result = (await loader({
				context,
				request,
			} as any)) as any;

			expect(result.apiUrl).toBe('https://api.example.com');
		});
	});

	describe('meta', () => {
		it('正しいメタデータを返す', () => {
			const result = meta({data: undefined} as any);

			expect(result).toEqual([
				{title: '映画管理 | SHINE Admin'},
				{name: 'description', content: '映画データベースの管理画面'},
			]);
		});
	});

	describe('Component', () => {
		it('ローディング状態が表示される', () => {
			render(
				<MemoryRouter initialEntries={['/admin/movies']}>
					<AdminMovies
						loaderData={
							{
								apiUrl: 'http://localhost:8787',
								page: 1,
								limit: 20,
								search: '',
								movies: [],
								pagination: {
									page: 1,
									limit: 20,
									totalCount: 0,
									totalPages: 0,
								},
							} as any
						}
						actionData={{} as any}
						params={{}}
						matches={[
							{
								id: 'root',
								params: {},
								pathname: '/',
								data: {} as any,
								handle: undefined,
							},
							{
								id: 'routes/admin.movies',
								params: {},
								pathname: '/admin/movies',
								data: {} as any,
								handle: undefined,
							},
						]}
					/>
				</MemoryRouter>,
			);

			expect(screen.getByText('Loading movies...')).toBeInTheDocument();
		});

		it('映画がない場合のメッセージが表示される', () => {
			// LocalStorageをセットアップ
			mockLocalStorage.getItem.mockReturnValue('valid-admin-token');

			// Fetchをモック
			const mockFetch = vi.mocked(fetch);
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					movies: [],
					pagination: {
						page: 1,
						limit: 20,
						totalCount: 0,
						totalPages: 0,
					},
				}),
			} as Response);

			render(
				<MemoryRouter initialEntries={['/admin/movies']}>
					<AdminMovies
						loaderData={
							{
								apiUrl: 'http://localhost:8787',
								page: 1,
								limit: 20,
								search: '',
								movies: [],
								pagination: {
									page: 1,
									limit: 20,
									totalCount: 0,
									totalPages: 0,
								},
							} as any
						}
						actionData={{} as any}
						params={{}}
						matches={[
							{
								id: 'root',
								params: {},
								pathname: '/',
								data: {} as any,
								handle: undefined,
							},
							{
								id: 'routes/admin.movies',
								params: {},
								pathname: '/admin/movies',
								data: {} as any,
								handle: undefined,
							},
						]}
					/>
				</MemoryRouter>,
			);

			// 初期状態はloading
			expect(screen.getByText('Loading movies...')).toBeInTheDocument();
		});

		it('ヘッダーとナビゲーションが表示される', () => {
			render(
				<MemoryRouter initialEntries={['/admin/movies']}>
					<AdminMovies
						loaderData={
							{
								apiUrl: 'http://localhost:8787',
								page: 1,
								limit: 20,
								search: '',
								movies: [],
								pagination: {
									page: 1,
									limit: 20,
									totalCount: 0,
									totalPages: 0,
								},
							} as any
						}
						actionData={{} as any}
						params={{}}
						matches={[
							{
								id: 'root',
								params: {},
								pathname: '/',
								data: {} as any,
								handle: undefined,
							},
							{
								id: 'routes/admin.movies',
								params: {},
								pathname: '/admin/movies',
								data: {} as any,
								handle: undefined,
							},
						]}
					/>
				</MemoryRouter>,
			);

			expect(screen.getByText('Movies Management')).toBeInTheDocument();
			expect(screen.getByText('Movie Selections')).toHaveAttribute(
				'href',
				'/admin/movies/selections',
			);
			expect(screen.getByText('Logout')).toBeInTheDocument();
		});

		it('検索入力フィールドが表示される', async () => {
			// LocalStorageをセットアップ
			mockLocalStorage.getItem.mockReturnValue('valid-admin-token');

			// Fetchをモック
			const mockFetch = vi.mocked(fetch);
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					movies: [],
					pagination: {
						page: 1,
						limit: 20,
						totalCount: 0,
						totalPages: 0,
					},
				}),
			} as Response);

			render(
				<MemoryRouter initialEntries={['/admin/movies']}>
					<AdminMovies
						loaderData={
							{
								apiUrl: 'http://localhost:8787',
								page: 1,
								limit: 20,
								search: '',
								movies: [],
								pagination: {
									page: 1,
									limit: 20,
									totalCount: 0,
									totalPages: 0,
								},
							} as any
						}
						actionData={{} as any}
						params={{}}
						matches={[
							{
								id: 'root',
								params: {},
								pathname: '/',
								data: {} as any,
								handle: undefined,
							},
							{
								id: 'routes/admin.movies',
								params: {},
								pathname: '/admin/movies',
								data: {} as any,
								handle: undefined,
							},
						]}
					/>
				</MemoryRouter>,
			);

			// 初期状態はloading
			expect(screen.getByText('Loading movies...')).toBeInTheDocument();

			// データがロードされるのを待つ
			const searchInput = await screen.findByPlaceholderText(
				'Search movies by title...',
			);
			expect(searchInput).toBeInTheDocument();
		});

		it('ログアウト機能が動作する', () => {
			const mockLocation = {href: ''};
			Object.defineProperty(globalThis, 'location', {
				value: mockLocation,
				writable: true,
			});

			render(
				<MemoryRouter initialEntries={['/admin/movies']}>
					<AdminMovies
						loaderData={
							{
								apiUrl: 'http://localhost:8787',
								page: 1,
								limit: 20,
								search: '',
								movies: [],
								pagination: {
									page: 1,
									limit: 20,
									totalCount: 0,
									totalPages: 0,
								},
							} as any
						}
						actionData={{} as any}
						params={{}}
						matches={[
							{
								id: 'root',
								params: {},
								pathname: '/',
								data: {} as any,
								handle: undefined,
							},
							{
								id: 'routes/admin.movies',
								params: {},
								pathname: '/admin/movies',
								data: {} as any,
								handle: undefined,
							},
						]}
					/>
				</MemoryRouter>,
			);

			const logoutButton = screen.getByText('Logout');
			fireEvent.click(logoutButton);

			expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('adminToken');
			expect(mockLocation.href).toBe('/admin/login');
		});
	});
});
