import '@testing-library/jest-dom';
import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import MovieDetail, {action, loader, meta} from './movies.$id';
import type {Route} from './+types/movies.$id';
import {createMockContext as createTestContext} from '@/lib/test-context';

// Cloudflare環境のモック
const createMockContext = (apiUrl = 'http://localhost:8787') =>
  createTestContext(apiUrl, {PUBLIC_TURNSTILE_SITE_KEY: 'test-site-key'});

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
        displayName: 'パルム・ドール',
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
        displayName: 'カンヌ国際映画祭',
      },
    },
    {
      uid: 'nom-2',
      isWinner: false,
      category: {
        uid: 'cat-2',
        name: 'Best Picture',
        displayName: '作品賞',
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
        displayName: 'アカデミー賞',
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

const mockRelatedMovies = [
  {
    uid: 'related-1',
    title: '関連映画A',
    year: 2022,
    posterUrl: 'https://example.com/related-a.jpg',
  },
  {
    uid: 'related-2',
    title: '関連映画B',
    year: 2021,
    posterUrl: undefined,
  },
];

// Fetchのモック
vi.stubGlobal('fetch', vi.fn());

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
  loaderData: MetaArguments['loaderData'],
  parameters: MetaArguments['params'],
): MetaArguments =>
  cast<MetaArguments>({
    loaderData,
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
      {
        movieDetail: mockMovieDetail,
        locale: 'ja',
        apiUrl: 'http://localhost:8787',
      },
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
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({movies: mockRelatedMovies}),
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
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8787/movies/movie-123/related?locale=ja&limit=6',
        {
          signal: request.signal,
        },
      );
      expect(result).toEqual({
        movieDetail: mockMovieDetail,
        relatedMovies: mockRelatedMovies,
        turnstileSiteKey: 'test-site-key',
        locale: 'ja',
        apiUrl: 'http://localhost:8787',
      });
    });

    it('関連映画の取得に失敗しても詳細は返す', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockMovieDetail,
      } as Response);
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

      expect(result).toMatchObject({
        movieDetail: mockMovieDetail,
        relatedMovies: [],
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

    it('説明文に選出元の団体名とあらすじを日本語で含む', () => {
      expect(successMeta()).toContainEqual({
        name: 'description',
        content:
          '『パルム・ドール受賞作品』(2023年)。カンヌ国際映画祭・アカデミー賞に選出。カンヌ国際映画祭でパルム・ドールを受賞した作品',
      });
    });

    it('あらすじが無い場合は配信状況の案内を返す', () => {
      const result = meta(
        createMetaArguments(
          {
            movieDetail: {...mockMovieDetail, description: undefined},
            locale: 'ja',
          },
          {id: 'movie-123'},
        ),
      );

      expect(result).toContainEqual({
        name: 'description',
        content:
          '『パルム・ドール受賞作品』(2023年)。カンヌ国際映画祭・アカデミー賞に選出。いま配信・レンタルで観られるかをまとめています。',
      });
    });

    it('長いあらすじは120文字に切り詰める', () => {
      const result = meta(
        createMetaArguments(
          {
            movieDetail: {...mockMovieDetail, description: 'あ'.repeat(200)},
            locale: 'ja',
          },
          {id: 'movie-123'},
        ),
      );
      const descriptor = result.find(
        item => 'name' in item && item.name === 'description',
      ) as {content: string};

      expect([...descriptor.content]).toHaveLength(120);
    });

    it('切り詰めたあらすじの末尾に三点リーダーを付ける', () => {
      const result = meta(
        createMetaArguments(
          {
            movieDetail: {...mockMovieDetail, description: 'あ'.repeat(200)},
            locale: 'ja',
          },
          {id: 'movie-123'},
        ),
      );
      const descriptor = result.find(
        item => 'name' in item && item.name === 'description',
      ) as {content: string};

      expect(descriptor.content.endsWith('…')).toBe(true);
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
            movieDetail: {
              ...mockMovieDetail,
              nominations: [],
              description: undefined,
            },
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

    it('schema.org MovieのJSON-LDを返す', () => {
      const jsonLd = successMeta().find(
        descriptor => 'script:ld+json' in descriptor,
      ) as {'script:ld+json': Record<string, unknown>} | undefined;

      expect(jsonLd?.['script:ld+json']).toMatchObject({
        '@context': 'https://schema.org',
        '@type': 'Movie',
        name: 'パルム・ドール受賞作品',
        url: 'https://shine-film.com/movies/movie-123',
        image: 'https://example.com/poster-large.jpg',
        datePublished: '2023',
        sameAs: 'https://www.imdb.com/title/tt1234567/',
      });
    });

    it('JSON-LDのawardには受賞したノミネーションだけを含める', () => {
      const jsonLd = successMeta().find(
        descriptor => 'script:ld+json' in descriptor,
      ) as {'script:ld+json': Record<string, unknown>};

      expect(jsonLd['script:ld+json'].award).toEqual([
        'カンヌ国際映画祭 パルム・ドール (2023)',
      ]);
    });

    it('ポスターが無ければJSON-LDにimageキーを含めない', () => {
      const result = meta(
        createMetaArguments(
          {
            movieDetail: {...mockMovieDetail, posterUrl: undefined},
            locale: 'ja',
          },
          {id: 'movie-123'},
        ),
      );
      const jsonLd = result.find(
        descriptor => 'script:ld+json' in descriptor,
      ) as {'script:ld+json': Record<string, unknown>};

      expect('image' in jsonLd['script:ld+json']).toBe(false);
    });

    it('エラー状態の場合はJSON-LDを返さない', () => {
      const result = meta(
        createMetaArguments(
          {error: '映画が見つかりませんでした', status: 404, locale: 'ja'},
          {id: 'movie-123'},
        ),
      );

      expect(result.some(descriptor => 'script:ld+json' in descriptor)).toBe(
        false,
      );
    });
  });

  describe('Component', () => {
    it('関連映画のリンクを表示する', () => {
      const loaderData = createLoaderData({relatedMovies: mockRelatedMovies});
      const parameters = createParameters('movie-123');

      render(
        <MovieDetail
          loaderData={loaderData}
          actionData={createActionData()}
          params={parameters}
          matches={createMatches(loaderData, parameters)}
        />,
      );

      const link = screen.getByRole('link', {name: /関連映画A/});
      expect(link).toHaveAttribute('href', '/movies/related-1');
      expect(screen.getByText('関連映画')).toBeInTheDocument();
    });

    it('「観た」トグルを表示する', () => {
      const loaderData = createLoaderData({relatedMovies: []});
      const parameters = createParameters('movie-123');

      render(
        <MovieDetail
          loaderData={loaderData}
          actionData={createActionData()}
          params={parameters}
          matches={createMatches(loaderData, parameters)}
        />,
      );

      expect(screen.getByRole('button', {name: '観た'})).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    });

    it('関連映画が無ければセクションを出さない', () => {
      const loaderData = createLoaderData({relatedMovies: []});
      const parameters = createParameters('movie-123');

      render(
        <MovieDetail
          loaderData={loaderData}
          actionData={createActionData()}
          params={parameters}
          matches={createMatches(loaderData, parameters)}
        />,
      );

      expect(screen.queryByText('関連映画')).not.toBeInTheDocument();
    });

    it('監督と出演者を表示する', () => {
      const loaderData = createLoaderData({
        movieDetail: {
          ...mockMovieDetail,
          credits: {
            cast: [{uid: 'p1', name: '西島秀俊', character: 'Yusuke Kafuku'}],
            crew: [{uid: 'p2', name: '濱口竜介', job: 'Director'}],
          },
        },
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

      expect(screen.getByText('濱口竜介')).toBeInTheDocument();
      expect(screen.getByText('西島秀俊', {exact: false})).toBeInTheDocument();
    });

    it('クレジットが無ければセクションを出さない', () => {
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

      expect(screen.queryByText('CAST & CREW')).not.toBeInTheDocument();
    });

    it('あらすじを表示する', () => {
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

      expect(
        screen.getByText('カンヌ国際映画祭でパルム・ドールを受賞した作品'),
      ).toBeInTheDocument();
    });

    it('あらすじが無ければセクションを出さない', () => {
      const loaderData = createLoaderData({
        movieDetail: {...mockMovieDetail, description: undefined},
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

      expect(screen.queryByText('あらすじ')).not.toBeInTheDocument();
    });

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

      // 年号は年別ページへのリンク
      expect(screen.getByRole('link', {name: '2023'})).toHaveAttribute(
        'href',
        '/years/2023',
      );

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

    it('視聴可否が未チェックならオンデマンドチェックの結果を表示する', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          available: true,
          availability: [
            {source: 'tmdb', detail: 'U-NEXT(見放題)', checkedAt: 1},
          ],
        }),
      } as Response);

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

      expect(screen.getByText('配信状況を確認中…')).toBeInTheDocument();

      expect(await screen.findByText('U-NEXT 見放題')).toBeInTheDocument();
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8787/movies/movie-123/availability/check',
        {method: 'POST'},
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

    it('賞の一覧ページへのナビゲーションを表示する', () => {
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

      expect(screen.getByRole('link', {name: 'Awards'})).toHaveAttribute(
        'href',
        '/awards',
      );
    });

    it('検索ページへのナビゲーションを表示する', () => {
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

      expect(screen.getByRole('link', {name: 'Search'})).toHaveAttribute(
        'href',
        '/search',
      );
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

      expect(screen.getByText('観た人の記事・ポスト')).toBeInTheDocument();

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

      expect(screen.getByText('感想や記事のリンクを貼る')).toBeInTheDocument();

      expect(screen.getByLabelText('URL')).toBeInTheDocument();
      expect(screen.getByLabelText('タイトル')).toBeInTheDocument();
      expect(screen.getByLabelText('ひとこと（任意）')).toBeInTheDocument();

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

      expect(screen.getByText('観た人の記事・ポスト')).toBeInTheDocument();
      expect(
        screen.getByText(
          'まだ投稿がありません。観たら感想や記事のリンクを貼ってください。',
        ),
      ).toBeInTheDocument();
    });

    it('記事・ポストの欄は関連映画より前に出る', () => {
      const loaderData = createLoaderData({relatedMovies: mockRelatedMovies});
      const parameters = createParameters('movie-123');

      render(
        <MovieDetail
          loaderData={loaderData}
          actionData={createActionData()}
          params={parameters}
          matches={createMatches(loaderData, parameters)}
        />,
      );

      const articles = screen.getByText('観た人の記事・ポスト');
      const related = screen.getByText('関連映画');
      expect(
        articles.compareDocumentPosition(related) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('URLの説明文にポストも貼れることを書く', () => {
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

      expect(screen.getByLabelText('URL')).toHaveAttribute(
        'placeholder',
        'ブログ記事や X・Bluesky のポストの URL',
      );
    });

    it('タイトルを取れないXのポストURLはアカウント名からタイトルを埋める', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({ok: false} as Response);
      const user = userEvent.setup();
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

      await user.type(
        screen.getByLabelText('URL'),
        'https://x.com/shine_film/status/1234567890',
      );

      expect(await screen.findByLabelText('タイトル')).toHaveValue(
        '@shine_film のポスト',
      );
    });

    it('タイトルを取れないBlueskyのポストURLはハンドルからタイトルを埋める', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({ok: false} as Response);
      const user = userEvent.setup();
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

      await user.type(
        screen.getByLabelText('URL'),
        'https://bsky.app/profile/shine-film.com/post/3kabc',
      );

      expect(await screen.findByLabelText('タイトル')).toHaveValue(
        '@shine-film.com のポスト',
      );
    });

    it('タイトルを取れない他のURLはホスト名でタイトルを埋める', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({ok: false} as Response);
      const user = userEvent.setup();
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

      await user.type(
        screen.getByLabelText('URL'),
        'https://note.com/someone/n/abcdef',
      );

      expect(await screen.findByLabelText('タイトル')).toHaveValue('note.com');
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
