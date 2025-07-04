import {describe, it, expect, vi, beforeEach} from 'vitest';
import {render, screen} from '@testing-library/react';
import '@testing-library/jest-dom';
import Home, {loader, meta} from './home';

// Cloudflare環境のモック
const createMockContext = (apiUrl = 'http://localhost:8787') => ({
	cloudflare: {
		env: {
			PUBLIC_API_URL: apiUrl,
		},
	},
});

// APIレスポンスのモック
const mockMovies = {
	daily: {
		uid: 'movie-1',
		title: 'テスト映画',
		year: 2023,
		posterUrl: 'https://example.com/poster.jpg',
		imdbUrl: 'https://www.imdb.com/title/tt1234567/',
		nominations: [
			{
				uid: 'nom-1',
				isWinner: true,
				category: {name: 'Best Picture'},
				ceremony: {uid: 'ceremony-1', name: 'Academy Awards', year: 2023},
				organization: {
					uid: 'org-1',
					name: 'Academy Awards',
					shortName: 'Oscars',
				},
			},
		],
		articleLinks: [],
	},
	weekly: {
		uid: 'movie-2',
		title: '週間映画',
		year: 2022,
		posterUrl: undefined,
		imdbUrl: 'https://www.imdb.com/title/tt7654321/',
		nominations: [],
		articleLinks: [],
	},
	monthly: {
		uid: 'movie-3',
		title: '月間映画',
		year: 2021,
		posterUrl: undefined,
		imdbUrl: 'https://www.imdb.com/title/tt9876543/',
		nominations: [],
		articleLinks: [],
	},
};

// Fetchのモック
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
				json: async () => mockMovies,
			} as Response);

			const context = createMockContext();
			const request = new Request('http://localhost:3000/');
			const result = await loader({
				context,
				request,
				params: {},
				matches: [
					{
						id: 'root',
						params: {},
						pathname: '/',
						data: undefined,
						handle: undefined,
					},
				],
			} as any);

			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringMatching(
					/^http:\/\/localhost:8787\/\?cache=.*&locale=en$/,
				),
				expect.objectContaining({
					headers: expect.objectContaining({
						'Cache-Control': 'no-store',
						'Accept-Language': 'en',
					}),
				}),
			);
			expect(result).toEqual({
				movies: mockMovies,
				error: undefined,
				locale: 'en',
				apiUrl: 'http://localhost:8787',
			});
		});

		it('API接続エラーの場合はエラー情報を返す', async () => {
			const mockFetch = vi.mocked(fetch);
			mockFetch.mockRejectedValueOnce(new Error('Network error'));

			const context = createMockContext();
			const request = new Request('http://localhost:3000/');
			const result = await loader({
				context,
				request,
				params: {},
				matches: [
					{
						id: 'root',
						params: {},
						pathname: '/',
						data: undefined,
						handle: undefined,
					},
				],
			} as any);

			expect(result).toEqual({
				movies: undefined,
				error: 'Network error',
				locale: 'en',
				apiUrl: 'http://localhost:8787',
				shouldFetchOnClient: true,
			});
		});

		it('APIレスポンスエラーの場合はエラー情報を返す', async () => {
			const mockFetch = vi.mocked(fetch);
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 500,
			} as Response);

			const context = createMockContext();
			const request = new Request('http://localhost:3000/');
			const result = await loader({
				context,
				request,
				params: {},
				matches: [
					{
						id: 'root',
						params: {},
						pathname: '/',
						data: undefined,
						handle: undefined,
					},
				],
			} as any);

			expect(result).toEqual({
				movies: undefined,
				error: 'API request failed: 500',
				locale: 'en',
				apiUrl: 'http://localhost:8787',
				shouldFetchOnClient: true,
			});
		});
	});

	describe('meta', () => {
		it('正しいメタデータを返す', () => {
			const result = meta({data: undefined} as any);

			expect(result).toEqual([
				{title: 'SHINE'},
				{
					name: 'description',
					content: "The world's most organized movie database",
				},
			]);
		});
	});

	describe('Component', () => {
		it('映画選択データが正常に表示される', () => {
			const loaderData = {
				movies: mockMovies,
				error: undefined,
				locale: 'ja',
				apiUrl: 'http://localhost:8787',
			};

			render(
				<Home
					loaderData={loaderData as any}
					actionData={undefined}
					params={{}}
					matches={
						[
							{
								id: 'root',
								params: {},
								pathname: '/',
								data: undefined,
								handle: undefined,
							},
							{
								id: 'routes/home',
								params: {},
								pathname: '/',
								data: loaderData,
								handle: undefined,
							},
						] as any
					}
				/>,
			);

			// 各セクションのタイトルが表示される
			expect(screen.getByText('日替わり')).toBeInTheDocument();
			expect(screen.getByText('週替わり')).toBeInTheDocument();
			expect(screen.getByText('月替わり')).toBeInTheDocument();

			// 映画タイトルが表示される
			expect(screen.getByText('テスト映画')).toBeInTheDocument();
			expect(screen.getByText('週間映画')).toBeInTheDocument();
			expect(screen.getByText('月間映画')).toBeInTheDocument();
		});

		it('エラー状態が正常に表示される', () => {
			const loaderData = {
				movies: {
					daily: {uid: '1', title: 'The Shawshank Redemption', year: 1994},
					weekly: {uid: '1', title: 'The Shawshank Redemption', year: 1994},
					monthly: {uid: '1', title: 'The Shawshank Redemption', year: 1994},
				},
				error: 'APIへの接続に失敗しました',
				locale: 'ja',
				apiUrl: 'http://localhost:8787',
			};

			render(
				<Home
					loaderData={loaderData as any}
					actionData={undefined}
					params={{}}
					matches={
						[
							{
								id: 'root',
								params: {},
								pathname: '/',
								data: undefined,
								handle: undefined,
							},
							{
								id: 'routes/home',
								params: {},
								pathname: '/',
								data: loaderData,
								handle: undefined,
							},
						] as any
					}
				/>,
			);

			expect(
				screen.getByText(
					/APIから映画データを取得できませんでした。フォールバック映画を表示しています。エラー: APIへの接続に失敗しました/,
				),
			).toBeInTheDocument();
		});

		it('受賞情報がバッジとして表示される', () => {
			const loaderData = {
				movies: mockMovies,
				error: undefined,
				locale: 'ja',
				apiUrl: 'http://localhost:8787',
			};

			render(
				<Home
					loaderData={loaderData as any}
					actionData={undefined}
					params={{}}
					matches={
						[
							{
								id: 'root',
								params: {},
								pathname: '/',
								data: undefined,
								handle: undefined,
							},
							{
								id: 'routes/home',
								params: {},
								pathname: '/',
								data: loaderData,
								handle: undefined,
							},
						] as any
					}
				/>,
			);

			const oscarsElements = screen.getAllByText('Oscars');
			expect(oscarsElements.length).toBeGreaterThanOrEqual(1);
			expect(oscarsElements[0]).toBeInTheDocument();
			// 2023年の年は複数箇所に表示されるため、ceremony contextで確認
			const ceremonyElement = oscarsElements[0].closest('div');
			expect(ceremonyElement).toHaveTextContent('2023');
			const bestPictureElements = screen.getAllByText('Best Picture');
			expect(bestPictureElements.length).toBeGreaterThanOrEqual(1);
			expect(bestPictureElements[0]).toBeInTheDocument();
			const awardElements = screen.getAllByText('受賞');
			expect(awardElements.length).toBeGreaterThanOrEqual(1);
			expect(awardElements[0]).toBeInTheDocument();
		});

		it('映画詳細ページへのリンクが正しく設定される', () => {
			const loaderData = {
				movies: mockMovies,
				error: undefined,
				locale: 'ja',
				apiUrl: 'http://localhost:8787',
			};

			render(
				<Home
					loaderData={loaderData as any}
					actionData={undefined}
					params={{}}
					matches={
						[
							{
								id: 'root',
								params: {},
								pathname: '/',
								data: undefined,
								handle: undefined,
							},
							{
								id: 'routes/home',
								params: {},
								pathname: '/',
								data: loaderData,
								handle: undefined,
							},
						] as any
					}
				/>,
			);

			const addArticleLinks = screen.getAllByText('+ リンクを追加');
			expect(addArticleLinks[0].closest('a')).toHaveAttribute(
				'href',
				'/movies/movie-1',
			);
			expect(addArticleLinks[1].closest('a')).toHaveAttribute(
				'href',
				'/movies/movie-2',
			);
			expect(addArticleLinks[2].closest('a')).toHaveAttribute(
				'href',
				'/movies/movie-3',
			);
		});
	});
});
