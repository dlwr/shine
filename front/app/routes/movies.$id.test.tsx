// eslint-disable-next-line import-x/no-unassigned-import -- Test setup requires side effects
import '@testing-library/jest-dom';
import {render, screen} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import MovieDetail, {action, loader, meta} from './movies.$id';

// Cloudflare環境のモック
const createMockContext = (apiUrl = 'http://localhost:8787') => ({
	cloudflare: {
		env: {
			PUBLIC_API_URL: apiUrl,
		},
	},
});

// 映画詳細データのモック
const mockMovieDetail = {
	uid: 'movie-123',
	year: 2023,
	originalLanguage: 'ja',
	imdbId: 'tt1234567',
	tmdbId: 123_456,
	imdbUrl: 'https://www.imdb.com/title/tt1234567/',
	posterUrl: 'https://example.com/poster-large.jpg',
	title: 'パルム・ドール受賞作品',
	description: 'カンヌ国際映画祭でパルム・ドールを受賞した作品',
	nominations: [
		{
			uid: 'nom-1',
			isWinner: true,
			category: {
				uid: 'cat-1',
				name: "Palme d'Or",
			},
			ceremony: {
				uid: 'cer-1',
				number: 76,
				year: 2023,
			},
			organization: {
				uid: 'org-1',
				name: 'Cannes Film Festival',
				shortName: 'Cannes',
			},
		},
		{
			uid: 'nom-2',
			isWinner: false,
			category: {
				uid: 'cat-2',
				name: 'Best Picture',
			},
			ceremony: {
				uid: 'cer-2',
				number: 96,
				year: 2024,
			},
			organization: {
				uid: 'org-2',
				name: 'Academy Awards',
				shortName: 'Oscars',
			},
		},
	],
	articleLinks: [
		{
			uid: 'article-1',
			url: 'https://example.com/article1',
			title: '映画レビュー記事',
			description: 'この映画についての詳細なレビュー',
		},
		{
			uid: 'article-2',
			url: 'https://example.com/article2',
			title: '監督インタビュー',
			description: '監督が語る製作秘話',
		},
	],
};

// Fetchのモック
globalThis.fetch = vi.fn();

describe('MovieDetail Component', () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	describe('loader', () => {
		it('指定されたIDの映画詳細データを正常に取得する', async () => {
			const mockFetch = vi.mocked(fetch);
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => mockMovieDetail,
			} as Response);

			const context = createMockContext();
			const parameters = {id: 'movie-123'};
			const request = {signal: undefined} as unknown as Request;
			const result = await loader({
				context,
				request,
				params: parameters,
				matches: [
					{
						id: 'root',
						params: {},
						pathname: '/',
						data: undefined,
						handle: undefined,
					},
					{
						id: 'routes/movies.$id',
						params: {id: 'movie-123'},
						pathname: '/movies/movie-123',
						data: undefined,
						handle: undefined,
					},
				],
			} as any);

			expect(mockFetch).toHaveBeenCalledWith(
				'http://localhost:8787/movies/movie-123',
				{
					signal: undefined,
				},
			);
			expect(result).toEqual({
				movieDetail: mockMovieDetail,
			});
		});

		it('存在しない映画IDの場合は404エラーを返す', async () => {
			const mockFetch = vi.mocked(fetch);
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 404,
			} as Response);

			const context = createMockContext();
			const parameters = {id: 'non-existent'};
			const request = {signal: undefined} as unknown as Request;
			const result = await loader({
				context,
				request,
				params: parameters,
				matches: [
					{
						id: 'root',
						params: {},
						pathname: '/',
						data: undefined,
						handle: undefined,
					},
					{
						id: 'routes/movies.$id',
						params: {id: 'non-existent'},
						pathname: '/movies/non-existent',
						data: undefined,
						handle: undefined,
					},
				],
			} as any);

			expect(result).toEqual({
				error: '映画が見つかりませんでした',
				status: 404,
			});
		});

		it('API接続エラーの場合はエラー情報を返す', async () => {
			const mockFetch = vi.mocked(fetch);
			mockFetch.mockRejectedValueOnce(new Error('Network error'));

			const context = createMockContext();
			const parameters = {id: 'movie-123'};
			const request = {signal: undefined} as unknown as Request;
			const result = await loader({
				context,
				request,
				params: parameters,
				matches: [
					{
						id: 'root',
						params: {},
						pathname: '/',
						data: undefined,
						handle: undefined,
					},
					{
						id: 'routes/movies.$id',
						params: {id: 'movie-123'},
						pathname: '/movies/movie-123',
						data: undefined,
						handle: undefined,
					},
				],
			} as any);

			expect(result).toEqual({
				error: 'APIへの接続に失敗しました',
				status: 500,
			});
		});
	});

	describe('meta', () => {
		it('映画データが正常な場合は映画タイトルを含むメタデータを返す', () => {
			const loaderData = {
				movieDetail: mockMovieDetail,
			};

			const result = meta({
				data: loaderData,
				location: {
					pathname: '/movies/movie-123',
					search: '',
					hash: '',
					state: undefined,
					key: '',
				},
				params: {id: 'movie-123'},
				matches: [
					{
						id: 'root',
						params: {},
						pathname: '/',
						data: undefined,
						handle: undefined,
					},
					{
						id: 'routes/movies.$id',
						params: {id: 'movie-123'},
						pathname: '/movies/movie-123',
						data: undefined,
						handle: undefined,
					},
				],
			} as any);

			expect(result).toEqual([
				{title: 'パルム・ドール受賞作品 (2023) | SHINE'},
				{
					name: 'description',
					content:
						'パルム・ドール受賞作品 (2023年) の詳細情報。受賞歴、ポスター、その他の情報をご覧いただけます。',
				},
			]);
		});

		it('エラー状態の場合はデフォルトメタデータを返す', () => {
			const loaderData = {
				error: '映画が見つかりませんでした',
				status: 404,
			};

			const result = meta({
				data: loaderData,
				location: {
					pathname: '/movies/movie-123',
					search: '',
					hash: '',
					state: undefined,
					key: '',
				},
				params: {id: 'movie-123'},
				matches: [
					{
						id: 'root',
						params: {},
						pathname: '/',
						data: undefined,
						handle: undefined,
					},
					{
						id: 'routes/movies.$id',
						params: {id: 'movie-123'},
						pathname: '/movies/movie-123',
						data: undefined,
						handle: undefined,
					},
				],
			} as any);

			expect(result).toEqual([
				{title: '映画が見つかりません | SHINE'},
				{
					name: 'description',
					content: '指定された映画は見つかりませんでした。',
				},
			]);
		});
	});

	describe('Component', () => {
		it('映画詳細データが正常に表示される', () => {
			const loaderData = {
				movieDetail: mockMovieDetail,
			};

			render(
				<MovieDetail
					loaderData={loaderData as any}
					actionData={undefined}
					params={{id: 'movie-123'}}
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
								id: 'routes/movies.$id',
								params: {id: 'movie-123'},
								pathname: '/movies/movie-123',
								data: loaderData,
								handle: undefined,
							},
						] as any
					}
				/>,
			);

			// 映画タイトルが表示される
			expect(screen.getByText('パルム・ドール受賞作品')).toBeInTheDocument();

			// 基本情報が表示される
			expect(screen.getByText('2023年')).toBeInTheDocument();
			const imdbElements = screen.getAllByText(/IMDb: tt\d+/);
			expect(imdbElements.length).toBeGreaterThanOrEqual(1);
			expect(imdbElements[0]).toHaveTextContent('IMDb: tt1234567');

			// IMDbリンクが表示される
			expect(screen.getByText('IMDbで見る')).toBeInTheDocument();

			// ポスター画像が表示される
			const posterImage = screen.getByAltText('パルム・ドール受賞作品');
			expect(posterImage).toBeInTheDocument();
			expect(posterImage).toHaveAttribute(
				'src',
				'https://example.com/poster-large.jpg',
			);
		});

		it('受賞・ノミネート情報が正しく表示される', () => {
			const loaderData = {
				movieDetail: mockMovieDetail,
			};

			render(
				<MovieDetail
					loaderData={loaderData as any}
					actionData={undefined}
					params={{id: 'movie-123'}}
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
								id: 'routes/movies.$id',
								params: {id: 'movie-123'},
								pathname: '/movies/movie-123',
								data: loaderData,
								handle: undefined,
							},
						] as any
					}
				/>,
			);

			// 受賞情報
			const winningElements = screen.getAllByText(/🏆.*受賞/);
			expect(winningElements.length).toBeGreaterThanOrEqual(1);
			expect(winningElements[0]).toHaveTextContent(
				'🏆 Cannes Film Festival 2023 受賞',
			);

			// ノミネート情報
			const nominationElements = screen.getAllByText(/🎬.*ノミネート/);
			expect(nominationElements.length).toBeGreaterThanOrEqual(1);
			expect(nominationElements[0]).toHaveTextContent(
				'🎬 Academy Awards 2024 ノミネート',
			);
		});

		it('404エラー状態が正常に表示される', () => {
			const loaderData = {
				error: '映画が見つかりませんでした',
				status: 404,
			};

			render(
				<MovieDetail
					loaderData={loaderData as any}
					actionData={undefined}
					params={{id: 'movie-123'}}
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
								id: 'routes/movies.$id',
								params: {id: 'movie-123'},
								pathname: '/movies/movie-123',
								data: loaderData,
								handle: undefined,
							},
						] as any
					}
				/>,
			);

			expect(screen.getByText('映画が見つかりません')).toBeInTheDocument();
			expect(
				screen.getByText('映画が見つかりませんでした'),
			).toBeInTheDocument();
		});

		it('サーバーエラー状態が正常に表示される', () => {
			const loaderData = {
				error: 'APIへの接続に失敗しました',
				status: 500,
			};

			render(
				<MovieDetail
					loaderData={loaderData as any}
					actionData={undefined}
					params={{id: 'movie-123'}}
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
								id: 'routes/movies.$id',
								params: {id: 'movie-123'},
								pathname: '/movies/movie-123',
								data: loaderData,
								handle: undefined,
							},
						] as any
					}
				/>,
			);

			expect(screen.getByText('エラーが発生しました')).toBeInTheDocument();
			expect(screen.getByText('APIへの接続に失敗しました')).toBeInTheDocument();
		});

		it('ホームページへの戻るリンクが表示される', () => {
			const loaderData = {
				movieDetail: mockMovieDetail,
			};

			render(
				<MovieDetail
					loaderData={loaderData as any}
					actionData={undefined}
					params={{id: 'movie-123'}}
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
								id: 'routes/movies.$id',
								params: {id: 'movie-123'},
								pathname: '/movies/movie-123',
								data: loaderData,
								handle: undefined,
							},
						] as any
					}
				/>,
			);

			const backLinks = screen.getAllByRole('link', {name: /ホームに戻る/});
			expect(backLinks.length).toBeGreaterThanOrEqual(1);
			expect(backLinks[0]).toBeInTheDocument();
			expect(backLinks[0]).toHaveAttribute('href', '/');
		});
	});

	describe('記事リンク機能', () => {
		it('記事リンクが正しく表示される', () => {
			const loaderData = {
				movieDetail: mockMovieDetail,
			};

			render(
				<MovieDetail
					loaderData={loaderData as any}
					actionData={undefined}
					params={{id: 'movie-123'}}
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
								id: 'routes/movies.$id',
								params: {id: 'movie-123'},
								pathname: '/movies/movie-123',
								data: loaderData,
								handle: undefined,
							},
						] as any
					}
				/>,
			);

			// 記事リンクセクションが表示される
			expect(screen.getByText('関連記事')).toBeInTheDocument();

			// 記事リンクが表示される
			expect(screen.getByText('映画レビュー記事')).toBeInTheDocument();
			expect(
				screen.getByText('この映画についての詳細なレビュー'),
			).toBeInTheDocument();
			expect(screen.getByText('監督インタビュー')).toBeInTheDocument();
			expect(screen.getByText('監督が語る製作秘話')).toBeInTheDocument();

			// 記事リンクが正しいURLにリンクしている
			const articleLink1 = screen.getByRole('link', {
				name: /映画レビュー記事/,
			});
			expect(articleLink1).toHaveAttribute(
				'href',
				'https://example.com/article1',
			);
			expect(articleLink1).toHaveAttribute('target', '_blank');
			expect(articleLink1).toHaveAttribute('rel', 'noopener noreferrer');

			const articleLink2 = screen.getByRole('link', {
				name: /監督インタビュー/,
			});
			expect(articleLink2).toHaveAttribute(
				'href',
				'https://example.com/article2',
			);
			expect(articleLink2).toHaveAttribute('target', '_blank');
			expect(articleLink2).toHaveAttribute('rel', 'noopener noreferrer');
		});

		it('記事リンク投稿フォームが表示される', () => {
			const loaderData = {
				movieDetail: mockMovieDetail,
			};

			render(
				<MovieDetail
					loaderData={loaderData as any}
					actionData={undefined}
					params={{id: 'movie-123'}}
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
								id: 'routes/movies.$id',
								params: {id: 'movie-123'},
								pathname: '/movies/movie-123',
								data: loaderData,
								handle: undefined,
							},
						] as any
					}
				/>,
			);

			// 記事投稿フォームが表示される
			expect(screen.getByText('記事を投稿する')).toBeInTheDocument();

			// フォームの各フィールドが存在する
			expect(screen.getByLabelText('記事URL')).toBeInTheDocument();
			expect(screen.getByLabelText('記事タイトル')).toBeInTheDocument();
			expect(screen.getByLabelText('記事の説明（任意）')).toBeInTheDocument();

			// 投稿ボタンが存在する
			expect(
				screen.getByRole('button', {name: '投稿する'}),
			).toBeInTheDocument();
		});

		it('記事リンクがない場合は空の状態が表示される', () => {
			const movieDetailWithoutArticles = {
				...mockMovieDetail,
				articleLinks: [],
			};

			const loaderData = {
				movieDetail: movieDetailWithoutArticles,
			};

			render(
				<MovieDetail
					loaderData={loaderData as any}
					actionData={undefined}
					params={{id: 'movie-123'}}
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
								id: 'routes/movies.$id',
								params: {id: 'movie-123'},
								pathname: '/movies/movie-123',
								data: loaderData,
								handle: undefined,
							},
						] as any
					}
				/>,
			);

			// 関連記事セクションは表示される
			expect(screen.getByText('関連記事')).toBeInTheDocument();

			// 空の状態メッセージが表示される
			expect(
				screen.getByText('まだ関連記事が投稿されていません。'),
			).toBeInTheDocument();
		});
	});

	describe('action', () => {
		it('記事リンク投稿が正常に処理される', async () => {
			const mockFetch = vi.mocked(fetch);
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({success: true}),
			} as Response);

			const formData = new FormData();
			formData.append('url', 'https://example.com/new-article');
			formData.append('title', '新しい記事');
			formData.append('description', '新しい記事の説明');

			const context = createMockContext();
			const parameters = {id: 'movie-123'};
			const request = {
				formData: async () => formData,
				signal: undefined,
			} as unknown as Request;

			const result = await action({
				context,
				request,
				params: parameters,
			} as any);

			expect(mockFetch).toHaveBeenCalledWith(
				'http://localhost:8787/movies/movie-123/article-links',
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						url: 'https://example.com/new-article',
						title: '新しい記事',
						description: '新しい記事の説明',
					}),
					signal: undefined,
				},
			);

			expect(result).toEqual({
				success: true,
				message: '記事リンクが投稿されました。',
			});
		});

		it('記事リンク投稿でバリデーションエラーが発生する', async () => {
			const mockFetch = vi.mocked(fetch);
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 400,
				json: async () => ({error: 'URLが無効です'}),
			} as Response);

			const formData = new FormData();
			formData.append('url', 'invalid-url');
			formData.append('title', '記事タイトル');
			formData.append('description', '記事の説明');

			const context = createMockContext();
			const parameters = {id: 'movie-123'};
			const request = {
				formData: async () => formData,
				signal: undefined,
			} as unknown as Request;

			const result = await action({
				context,
				request,
				params: parameters,
			} as any);

			expect(result).toEqual({
				success: false,
				error: 'URLが無効です',
			});
		});

		it('記事リンク投稿でレート制限エラーが発生する', async () => {
			const mockFetch = vi.mocked(fetch);
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 429,
				json: async () => ({error: '投稿制限に達しました'}),
			} as Response);

			const formData = new FormData();
			formData.append('url', 'https://example.com/article');
			formData.append('title', '記事タイトル');
			formData.append('description', '記事の説明');

			const context = createMockContext();
			const parameters = {id: 'movie-123'};
			const request = {
				formData: async () => formData,
				signal: undefined,
			} as unknown as Request;

			const result = await action({
				context,
				request,
				params: parameters,
			} as any);

			expect(result).toEqual({
				success: false,
				error: '投稿制限に達しました',
			});
		});
	});
});
