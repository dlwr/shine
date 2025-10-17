import '@testing-library/jest-dom';
import {render, screen} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import Search, {loader, meta} from './search';
import type {Route} from './+types/search';

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

// 検索結果のモックデータ
const mockSearchResults = {
	movies: [
		{
			movieUid: 'movie-1',
			movie: {
				imdbId: 'tt1234567',
				year: 2023,
				duration: 120,
			},
			translations: [
				{
					languageCode: 'ja',
					content: '検索結果映画1',
				},
			],
			posterUrls: [
				{
					url: 'https://example.com/poster1.jpg',
					isPrimary: true,
				},
			],
		},
		{
			movieUid: 'movie-2',
			movie: {
				imdbId: 'tt7654321',
				year: 2022,
				duration: 110,
			},
			translations: [
				{
					languageCode: 'ja',
					content: '検索結果映画2',
				},
			],
			posterUrls: [],
		},
	],
	pagination: {
		page: 1,
		limit: 20,
		total: 2,
		totalPages: 1,
	},
};

describe('Search Component', () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

const cast = <T,>(value: unknown): T => value as T;

type LoaderResult = Awaited<ReturnType<typeof loader>>;
type LoaderArgs = Route.LoaderArgs;
type MetaArgs = Route.MetaArgs;
type ComponentProps = Route.ComponentProps;
type Matches = ComponentProps['matches'];

const createLoaderArgs = (
	context: LoaderArgs['context'],
	request: LoaderArgs['request'],
	params: LoaderArgs['params'],
): LoaderArgs =>
	cast<LoaderArgs>({
		context,
		request,
		params,
		matches: [],
	});

const createMetaArgs = (
	data: MetaArgs['data'],
	locationSearch: string,
): MetaArgs =>
	cast<MetaArgs>({
		data,
		params: {},
		location: {
			pathname: '/search',
			search: locationSearch,
			hash: '',
			state: undefined,
			key: 'search-test',
		},
		matches: [],
	});

const createLoaderData = (
	overrides: Partial<LoaderResult> = {},
): LoaderResult => ({
	searchQuery: '',
	searchResults: undefined,
	...overrides,
});

const createParams = (): ComponentProps['params'] =>
	cast<ComponentProps['params']>({});

const createMatches = (
	loaderData: LoaderResult,
): Matches =>
	cast<Matches>([
		{
			id: 'root',
			params: {},
			pathname: '/',
			data: undefined,
			handle: undefined,
		},
		{
			id: 'routes/search',
			params: {},
			pathname: '/search',
			data: loaderData,
			handle: undefined,
		},
	]);

const createActionData = (): ComponentProps['actionData'] =>
	cast<ComponentProps['actionData']>(undefined);

	describe('loader', () => {
		it('検索クエリありの場合は検索結果を取得する', async () => {
			const mockFetch = vi.mocked(fetch);
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => mockSearchResults,
			} as Response);

			const context = createMockContext();
			const url = new URL('http://localhost:3000/search?q=test');
			const request = {url} as unknown as Request;

			const result = await loader(
				createLoaderArgs(context, request, {}),
			);

			expect(mockFetch).toHaveBeenCalledWith(
				'http://localhost:8787/movies/search?q=test&page=1&limit=20',
				{
					signal: undefined,
				},
			);
			expect(result).toEqual({
				searchQuery: 'test',
				searchResults: mockSearchResults,
			});
		});

		it('検索クエリなしの場合は空の結果を返す', async () => {
			const context = createMockContext();
			const url = new URL('http://localhost:3000/search');
			const request = {url} as unknown as Request;

			const result = await loader(
				createLoaderArgs(context, request, {}),
			);

			expect(result).toEqual({
				searchQuery: '',
				searchResults: undefined,
			});
		});

		it('API接続エラーの場合はエラー情報を返す', async () => {
			const mockFetch = vi.mocked(fetch);
			mockFetch.mockRejectedValueOnce(new Error('Network error'));

			const context = createMockContext();
			const url = new URL('http://localhost:3000/search?q=test');
			const request = {url} as unknown as Request;

			const result = await loader(
				createLoaderArgs(context, request, {}),
			);

			expect(result).toEqual({
				searchQuery: 'test',
				error: '検索に失敗しました',
			});
		});
	});

	describe('meta', () => {
		it('検索クエリありの場合は検索クエリを含むメタデータを返す', () => {
			const loaderData = {
				searchQuery: 'test movie',
				searchResults: mockSearchResults,
			};

			const result = meta(createMetaArgs(loaderData, '?q=test%20movie'));

			expect(result).toEqual([
				{title: '「test movie」の検索結果 | SHINE'},
				{
					name: 'description',
					content: '「test movie」の検索結果 - SHINE映画データベース',
				},
			]);
		});

		it('検索クエリなしの場合はデフォルトメタデータを返す', () => {
			const loaderData = {
				searchQuery: '',
				searchResults: undefined,
			};

			const result = meta(createMetaArgs(loaderData, '?q=test%20movie'));

			expect(result).toEqual([
				{title: '映画検索 | SHINE'},
				{name: 'description', content: 'SHINE映画データベースで映画を検索'},
			]);
		});
	});

	describe('Component', () => {
		it('検索フォームが正常に表示される', () => {
			const loaderData = createLoaderData();

			render(
				<Search
					loaderData={loaderData}
					actionData={createActionData()}
					params={createParams()}
					matches={createMatches(loaderData)}
				/>,
			);

			expect(screen.getByText('映画検索')).toBeInTheDocument();
			expect(
				screen.getByPlaceholderText('映画タイトルを入力...'),
			).toBeInTheDocument();
			expect(screen.getByRole('button', {name: '検索'})).toBeInTheDocument();
		});

		it('検索結果が正常に表示される', () => {
			const loaderData = createLoaderData({
				searchQuery: 'test',
				searchResults: mockSearchResults,
			});

			render(
				<Search
					loaderData={loaderData}
					actionData={createActionData()}
					params={createParams()}
					matches={createMatches(loaderData)}
				/>,
			);

			expect(screen.getByText('「test」の検索結果')).toBeInTheDocument();
			expect(screen.getByText('2件見つかりました')).toBeInTheDocument();
			expect(screen.getByText('検索結果映画1')).toBeInTheDocument();
			expect(screen.getByText('検索結果映画2')).toBeInTheDocument();
		});

		it('検索結果なしの場合は適切なメッセージが表示される', () => {
			const loaderData = createLoaderData({
				searchQuery: 'nomatch',
				searchResults: {
					movies: [],
					pagination: {
						page: 1,
						limit: 20,
						total: 0,
						totalPages: 0,
					},
				},
			});

			render(
				<Search
					loaderData={loaderData}
					actionData={createActionData()}
					params={createParams()}
					matches={createMatches(loaderData)}
				/>,
			);

			expect(
				screen.getByText('検索結果が見つかりませんでした'),
			).toBeInTheDocument();
		});

		it('エラー状態が正常に表示される', () => {
			const loaderData = createLoaderData({
				searchQuery: 'test',
				error: '検索に失敗しました',
			});

			render(
				<Search
					loaderData={loaderData}
					actionData={createActionData()}
					params={createParams()}
					matches={createMatches(loaderData)}
				/>,
			);

			expect(screen.getByText('検索に失敗しました')).toBeInTheDocument();
		});

		it('映画詳細ページへのリンクが正しく設定される', () => {
			const loaderData = createLoaderData({
				searchQuery: 'test',
				searchResults: mockSearchResults,
			});

			render(
				<Search
					loaderData={loaderData}
					actionData={createActionData()}
					params={createParams()}
					matches={createMatches(loaderData)}
				/>,
			);

			const movieLinks = screen.getAllByRole('link');
			const movieDetailLinks = movieLinks.filter((link) =>
				link.getAttribute('href')?.startsWith('/movies/'),
			);

			expect(movieDetailLinks[0]).toHaveAttribute('href', '/movies/movie-1');
			expect(movieDetailLinks[1]).toHaveAttribute('href', '/movies/movie-2');
		});

		it('ホームページへの戻るリンクが表示される', () => {
			const loaderData = createLoaderData();

			render(
				<Search
					loaderData={loaderData}
					actionData={createActionData()}
					params={createParams()}
					matches={createMatches(loaderData)}
				/>,
			);

			const homeLinks = screen.getAllByRole('link', {name: /ホームに戻る/});
			expect(homeLinks.length).toBeGreaterThanOrEqual(1);
			expect(homeLinks[0]).toBeInTheDocument();
			expect(homeLinks[0]).toHaveAttribute('href', '/');
		});
	});
});
