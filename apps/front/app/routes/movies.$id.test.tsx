import '@testing-library/jest-dom';
import {render, screen} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import MovieDetail, {action, loader, meta} from './movies.$id';
import type {Route} from './+types/movies.$id';

// Cloudflare環境のモック
const createMockContext = (apiUrl = 'http://localhost:8787') => ({
  cloudflare: {
    env: {
      PUBLIC_API_URL: apiUrl,
      PUBLIC_TURNSTILE_SITE_KEY: 'test-site-key',
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

const cast = <T,>(value?: unknown): T => value as T;

type LoaderResult = Awaited<ReturnType<typeof loader>>;
type LoaderArguments = Route.LoaderArgs;
type MetaArguments = Route.MetaArgs;
type ComponentProperties = Route.ComponentProps;
type Matches = ComponentProperties['matches'];
type ActionArguments = Route.ActionArgs;
const movieRoutePattern = '/movies/:id';

type LoaderOverrides = Partial<
  Omit<LoaderArguments, 'context' | 'request' | 'params'>
> & {
  matches?: Matches;
};

const createLoaderArguments = (
  context: LoaderArguments['context'],
  request: LoaderArguments['request'],
  parameters: LoaderArguments['params'],
  overrides: LoaderOverrides = {},
): LoaderArguments =>
  cast<LoaderArguments>({
    context,
    request,
    params: parameters,
    unstable_pattern: movieRoutePattern,
    matches: [],
    ...overrides,
  });

const createMetaArguments = (
  data: MetaArguments['data'],
  parameters: MetaArguments['params'],
): MetaArguments =>
  cast<MetaArguments>({
    data,
    params: parameters,
    location: {
      pathname: '/movies/movie-123',
      search: '',
      hash: '',
      state: undefined,
      key: 'movies-id-test',
    },
    matches: [],
  });

const createLoaderData = (
  overrides: Partial<LoaderResult> = {},
): LoaderResult => ({
  movieDetail: mockMovieDetail,
  turnstileSiteKey: 'test-site-key',
  locale: 'ja',
  apiUrl: 'http://localhost:8787',
  ...overrides,
});

const successMeta = () =>
  meta(
    createMetaArguments(
      {movieDetail: mockMovieDetail, locale: 'ja', apiUrl: 'http://localhost:8787'},
      {id: 'movie-123'},
    ),
  );

const createMatches = (
  loaderData: LoaderResult,
  parameters: ComponentProperties['params'],
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
      id: 'routes/movies.$id',
      params: parameters,
      pathname: `/movies/${parameters.id ?? ''}`,
      data: loaderData,
      handle: undefined,
    },
  ]);

const createParameters = (id: string): ComponentProperties['params'] =>
  cast<ComponentProperties['params']>({id});

const createActionData = (): ComponentProperties['actionData'] =>
  cast<ComponentProperties['actionData']>();

const createActionArguments = (
  context: ActionArguments['context'],
  request: ActionArguments['request'],
  parameters: ActionArguments['params'],
): ActionArguments =>
  cast<ActionArguments>({
    context,
    request,
    params: parameters,
    unstable_pattern: movieRoutePattern,
    matches: [],
  });

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
      const request = new Request('http://localhost:3000/movies/movie-123');
      const result = await loader(
        createLoaderArguments(context, request, parameters, {
          matches: createMatches(
            createLoaderData(),
            createParameters(parameters.id),
          ),
        }),
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8787/movies/movie-123',
        {
          signal: request.signal,
        },
      );
      expect(result).toEqual({
        movieDetail: mockMovieDetail,
        turnstileSiteKey: 'test-site-key',
        locale: 'ja',
        apiUrl: 'http://localhost:8787',
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
      const request = new Request('http://localhost:3000/movies/non-existent');
      const result = await loader(
        createLoaderArguments(context, request, parameters, {
          matches: createMatches(
            createLoaderData(),
            createParameters(parameters.id),
          ),
        }),
      );

      expect(result).toEqual({
        error: '映画が見つかりませんでした',
        status: 404,
        locale: 'ja',
      });
    });

    it('API接続エラーの場合はエラー情報を返す', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const context = createMockContext();
      const parameters = {id: 'movie-123'};
      const request = new Request('http://localhost:3000/movies/movie-123');
      const result = await loader(
        createLoaderArguments(context, request, parameters, {
          matches: createMatches(
            createLoaderData(),
            createParameters(parameters.id),
          ),
        }),
      );

      expect(result).toEqual({
        error: 'APIへの接続に失敗しました',
        status: 500,
        locale: 'ja',
      });
    });
  });

  describe('meta', () => {
    it('タイトルに映画名と製作年を含む', () => {
      expect(successMeta()).toContainEqual({
        title: 'パルム・ドール受賞作品 (2023) | SHINE',
      });
    });

    it('説明文に選出元の団体名を含む', () => {
      expect(successMeta()).toContainEqual({
        name: 'description',
        content:
          '『パルム・ドール受賞作品』(2023年)。Cannes・Oscarsに選出。いま配信・レンタルで観られるかをまとめています。',
      });
    });

    it('og:imageに生成カードのURLを返す', () => {
      expect(successMeta()).toContainEqual({
        property: 'og:image',
        content: 'https://shine-film.com/og/movie.png?id=movie-123',
      });
    });

    it('twitter:cardはsummary_large_imageになる', () => {
      expect(successMeta()).toContainEqual({
        name: 'twitter:card',
        content: 'summary_large_image',
      });
    });

    it('ポスターが無くてもog:imageは生成カードを返す', () => {
      const result = meta(
        createMetaArguments(
          {
            movieDetail: {...mockMovieDetail, posterUrl: undefined},
            locale: 'ja',
          },
          {id: 'movie-123'},
        ),
      );

      expect(result).toContainEqual({
        property: 'og:image',
        content: 'https://shine-film.com/og/movie.png?id=movie-123',
      });
    });

    it('og:urlに映画詳細ページの絶対URLを返す', () => {
      expect(successMeta()).toContainEqual({
        property: 'og:url',
        content: 'https://shine-film.com/movies/movie-123',
      });
    });

    it('og:typeはarticleになる', () => {
      expect(successMeta()).toContainEqual({
        property: 'og:type',
        content: 'article',
      });
    });

    it('選出情報が無い場合は団体名を省いた説明文を返す', () => {
      const result = meta(
        createMetaArguments(
          {
            movieDetail: {...mockMovieDetail, nominations: []},
            locale: 'ja',
          },
          {id: 'movie-123'},
        ),
      );

      expect(result).toContainEqual({
        name: 'description',
        content:
          '『パルム・ドール受賞作品』(2023年)。いま配信・レンタルで観られるかをまとめています。',
      });
    });

    it('エラー状態の場合はエラー用のタイトルを返す', () => {
      const result = meta(
        createMetaArguments(
          {error: '映画が見つかりませんでした', status: 404, locale: 'ja'},
          {id: 'movie-123'},
        ),
      );

      expect(result).toContainEqual({title: '映画が見つかりません | SHINE'});
    });
  });

  describe('Component', () => {
    it('映画詳細データが正常に表示される', () => {
      const loaderData = createLoaderData();
      const parameters = createParameters('movie-123');

      render(
        <MovieDetail
          loaderData={loaderData}
          actionData={createActionData()}
          params={parameters}
          matches={createMatches(loaderData, parameters)}
        />,
      );

      // 映画タイトルがh1として表示される
      expect(
        screen.getByRole('heading', {level: 1, name: 'パルム・ドール受賞作品'}),
      ).toBeInTheDocument();

      // 年号がBigYearのaria-labelとして確認できる
      expect(screen.getByLabelText('2023')).toBeInTheDocument();

      // IMDb情報がメタラインに表示される
      expect(screen.getByText(/IMDb tt1234567/)).toBeInTheDocument();

      // WatchMenuのIMDbリンクが表示される
      expect(screen.getByRole('link', {name: /IMDb/})).toBeInTheDocument();

      // ポスター画像がPosterFrameのalt属性で表示される
      const posterImage = screen.getByAltText('パルム・ドール受賞作品 poster');
      expect(posterImage).toBeInTheDocument();
      expect(posterImage).toHaveAttribute(
        'src',
        'https://example.com/poster-large.jpg',
      );
    });

    it('視聴可否バッジが表示される', () => {
      const loaderData = {
        locale: 'ja' as const,
        movieDetail: {
          ...mockMovieDetail,
          availability: [
            {
              source: 'tmdb',
              detail: 'U-NEXT(見放題)',
              checkedAt: 1_784_067_000,
            },
            {
              source: 'discas',
              detail: 'Matched: パルム・ドール受賞作品',
              checkedAt: 1_784_067_000,
            },
          ],
        },
      };
      const parameters = createParameters('movie-123');

      render(
        <MovieDetail
          loaderData={loaderData}
          actionData={createActionData()}
          params={parameters}
          matches={createMatches(loaderData, parameters)}
        />,
      );

      expect(screen.getByText('U-NEXT 見放題')).toBeInTheDocument();
      expect(screen.getByText('宅配レンタル')).toHaveAttribute(
        'title',
        'TSUTAYA DISCAS',
      );
    });

    it('受賞・ノミネート情報が正しく表示される', () => {
      const loaderData = createLoaderData();
      const parameters = createParameters('movie-123');

      render(
        <MovieDetail
          loaderData={loaderData}
          actionData={createActionData()}
          params={parameters}
          matches={createMatches(loaderData, parameters)}
        />,
      );

      // AwardTreeによる受賞表示
      expect(screen.getByText(/WINNER/)).toBeInTheDocument();

      // AwardTreeによるノミネート表示
      expect(screen.getByText(/NOMINEE/)).toBeInTheDocument();
    });

    it('404エラー状態が正常に表示される', () => {
      const loaderData = cast<LoaderResult>({
        error: '映画が見つかりませんでした',
        status: 404,
      });
      const parameters = createParameters('movie-123');

      render(
        <MovieDetail
          loaderData={loaderData}
          actionData={createActionData()}
          params={parameters}
          matches={createMatches(loaderData, parameters)}
        />,
      );

      expect(screen.getByText('映画が見つかりません')).toBeInTheDocument();
      expect(
        screen.getByText('映画が見つかりませんでした'),
      ).toBeInTheDocument();
    });

    it('サーバーエラー状態が正常に表示される', () => {
      const loaderData = cast<LoaderResult>({
        error: 'APIへの接続に失敗しました',
        status: 500,
      });
      const parameters = createParameters('movie-123');

      render(
        <MovieDetail
          loaderData={loaderData}
          actionData={createActionData()}
          params={parameters}
          matches={createMatches(loaderData, parameters)}
        />,
      );

      expect(screen.getByText('エラーが発生しました')).toBeInTheDocument();
      expect(screen.getByText('APIへの接続に失敗しました')).toBeInTheDocument();
    });

    it('ホームページへの戻るリンクが表示される', () => {
      const loaderData = createLoaderData();
      const parameters = createParameters('movie-123');

      render(
        <MovieDetail
          loaderData={loaderData}
          actionData={createActionData()}
          params={parameters}
          matches={createMatches(loaderData, parameters)}
        />,
      );

      const backLinks = screen.getAllByRole('link', {name: /SHINE/});
      expect(backLinks.length).toBeGreaterThanOrEqual(1);
      expect(backLinks[0]).toBeInTheDocument();
      expect(backLinks[0]).toHaveAttribute('href', '/');
    });
  });

  describe('記事リンク機能', () => {
    it('記事リンクが正しく表示される', () => {
      const loaderData = createLoaderData();
      const parameters = createParameters('movie-123');

      render(
        <MovieDetail
          loaderData={loaderData}
          actionData={createActionData()}
          params={parameters}
          matches={createMatches(loaderData, parameters)}
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
      const loaderData = createLoaderData();
      const parameters = createParameters('movie-123');

      render(
        <MovieDetail
          loaderData={loaderData}
          actionData={createActionData()}
          params={parameters}
          matches={createMatches(loaderData, parameters)}
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
      const parameters = createParameters('movie-123');

      render(
        <MovieDetail
          loaderData={cast<LoaderResult>(loaderData)}
          actionData={createActionData()}
          params={parameters}
          matches={createMatches(cast<LoaderResult>(loaderData), parameters)}
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
      formData.append('captchaToken', 'test-token');

      const context = createMockContext();
      const parameters = {id: 'movie-123'};
      const request = {
        formData: async () => formData,
        signal: undefined,
      } as unknown as Request;

      const result = await action(
        createActionArguments(context, request, parameters),
      );

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
            captchaToken: 'test-token',
          }),
          signal: undefined,
        },
      );

      expect(result).toBeInstanceOf(Response);
      if (!(result instanceof Response)) {
        throw new TypeError('Expected redirect Response');
      }

      expect(result.status).toBe(303);
      expect(result.headers.get('Location')).toBe('/');
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
      formData.append('captchaToken', 'test-token');

      const context = createMockContext();
      const parameters = {id: 'movie-123'};
      const request = {
        formData: async () => formData,
        signal: undefined,
      } as unknown as Request;

      const result = await action(
        createActionArguments(context, request, parameters),
      );

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
      formData.append('captchaToken', 'test-token');

      const context = createMockContext();
      const parameters = {id: 'movie-123'};
      const request = {
        formData: async () => formData,
        signal: undefined,
      } as unknown as Request;

      const result = await action(
        createActionArguments(context, request, parameters),
      );

      expect(result).toEqual({
        success: false,
        error: '投稿制限に達しました',
      });
    });

    it('認証トークンがない場合はエラーを返す', async () => {
      const mockFetch = vi.mocked(fetch);
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

      const result = await action(
        createActionArguments(context, request, parameters),
      );

      expect(mockFetch).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: false,
        error: '認証に失敗しました。少し待ってから再度お試しください。',
      });
    });
  });
});
