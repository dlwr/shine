import {describe, it, expect, vi, beforeEach} from 'vitest';
import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import '@testing-library/jest-dom';
import homeSource from './home.tsx?raw';
import Home, {loader, meta} from './home';
import type {Route} from './+types/home';
import {createMockContext} from '@/lib/test-context';
import '@/components/admin/admin-session-bar';
import '@/components/admin/selection-admin-controls';

// Cloudflare環境のモック

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
vi.stubGlobal('fetch', vi.fn());

const cast = <T,>(value?: unknown): T => value as T;

type LoaderResult = Awaited<ReturnType<typeof loader>>;
type LoaderSuccess = Extract<LoaderResult, {error: undefined}>;
type LoaderFailure = Extract<LoaderResult, {error: string}>;
type LoaderArguments = Route.LoaderArgs;
type ComponentProperties = Route.ComponentProps;

const createLoaderArguments = (
  context: LoaderArguments['context'],
  request: LoaderArguments['request'],
  overrides: Partial<Omit<LoaderArguments, 'context' | 'request'>> = {},
): LoaderArguments =>
  cast<LoaderArguments>({
    context,
    request,
    params: {},
    matches: [],
    ...overrides,
  });

const createLoaderData = (
  overrides: Partial<LoaderSuccess> = {},
): LoaderSuccess => ({
  movies: mockMovies,
  error: undefined,
  locale: 'ja',
  apiUrl: 'http://localhost:8787',
  transformImages: false,
  shouldFetchOnClient: undefined,
  ...overrides,
});

const createErrorLoaderData = (
  overrides: Partial<LoaderFailure> = {},
): LoaderFailure => ({
  movies: undefined,
  error: 'API request failed',
  locale: 'ja',
  apiUrl: 'http://localhost:8787',
  transformImages: false,
  shouldFetchOnClient: true,
  ...overrides,
});

const createParameters = (): ComponentProperties['params'] =>
  cast<ComponentProperties['params']>({});

const createMatches = (
  loaderData: ComponentProperties['loaderData'],
): ComponentProperties['matches'] =>
  cast<ComponentProperties['matches']>([
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
      loaderData: loaderData as NonNullable<
        ComponentProperties['matches'][number]
      >['loaderData'],
      handle: undefined,
    },
  ]);

const createActionData = (): ComponentProperties['actionData'] =>
  cast<ComponentProperties['actionData']>();

const createMetaArguments = (locale: 'ja' | 'en'): Route.MetaArgs =>
  cast<Route.MetaArgs>({loaderData: {locale}});

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
      const result = await loader(createLoaderArguments(context, request));

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(
          /^http:\/\/localhost:8787\/\?cache=.*&locale=ja$/,
        ),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Cache-Control': 'no-store',
            'Accept-Language': 'ja,en;q=0.5',
          }),
        }),
      );
      expect(result).toEqual({
        movies: mockMovies,
        error: undefined,
        locale: 'ja',
        apiUrl: 'http://localhost:8787',
        transformImages: false,
      });
    });

    it('API接続エラーの場合はエラー情報を返す', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const context = createMockContext();
      const request = new Request('http://localhost:3000/');
      const result = await loader(createLoaderArguments(context, request));

      expect(result).toEqual({
        movies: undefined,
        error: 'Network error',
        locale: 'ja',
        apiUrl: 'http://localhost:8787',
        transformImages: false,
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
      const result = await loader(createLoaderArguments(context, request));

      expect(result).toEqual({
        movies: undefined,
        error: 'API request failed: 500',
        locale: 'ja',
        apiUrl: 'http://localhost:8787',
        transformImages: false,
        shouldFetchOnClient: true,
      });
    });
  });

  describe('meta', () => {
    it('日本語ロケールでは日本語のタイトルを返す', () => {
      expect(meta(createMetaArguments('ja'))).toContainEqual({
        title: 'SHINE — 毎月1本、みんなで同じ映画を観る',
      });
    });

    it('英語ロケールでは英語のタイトルを返す', () => {
      expect(meta(createMetaArguments('en'))).toContainEqual({
        title: 'SHINE — A forgotten film, every day',
      });
    });

    it('日本語ロケールでは日本語の説明文を返す', () => {
      expect(meta(createMetaArguments('ja'))).toContainEqual({
        name: 'description',
        content:
          'カンヌ・アカデミー賞・日本アカデミー賞などの受賞作や名作リストから、毎日・毎週・毎月1本ずつ映画を選びます。いま配信やレンタルで観られるかも一緒に。',
      });
    });

    it('ロケールに対応するog:localeを返す', () => {
      expect(meta(createMetaArguments('ja'))).toContainEqual({
        property: 'og:locale',
        content: 'ja_JP',
      });
    });

    it('og:urlにサイトのトップURLを返す', () => {
      expect(meta(createMetaArguments('ja'))).toContainEqual({
        property: 'og:url',
        content: 'https://shine-film.com/',
      });
    });

    it('og:imageにブランドカードを返す', () => {
      expect(meta(createMetaArguments('ja'))).toContainEqual({
        property: 'og:image',
        content: 'https://shine-film.com/og/home.png',
      });
    });

    it('twitter:cardはsummary_large_imageになる', () => {
      expect(meta(createMetaArguments('ja'))).toContainEqual({
        name: 'twitter:card',
        content: 'summary_large_image',
      });
    });
  });

  describe('Component', () => {
    it('サイトの説明がフッターに表示される', () => {
      const loaderData =
        cast<ComponentProperties['loaderData']>(createLoaderData());

      render(
        <Home
          loaderData={loaderData}
          actionData={createActionData()}
          params={createParameters()}
          matches={createMatches(loaderData)}
        />,
      );

      expect(
        screen.getByText(/毎月1本を選び、みんなで同じ映画を観る/),
      ).toBeInTheDocument();
    });

    it('月替わりを「今月の1本」として日替わりより先に出す', () => {
      const loaderData =
        cast<ComponentProperties['loaderData']>(createLoaderData());

      render(
        <Home
          loaderData={loaderData}
          actionData={createActionData()}
          params={createParameters()}
          matches={createMatches(loaderData)}
        />,
      );

      expect(screen.getByText('MONTHLY / 今月の1本')).toBeInTheDocument();
      const monthly = screen.getByText('月間映画');
      const daily = screen.getByText('テスト映画');
      expect(
        monthly.compareDocumentPosition(daily) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('第一画面で「毎月1本、みんなで同じ映画を観る」と伝える', () => {
      const loaderData =
        cast<ComponentProperties['loaderData']>(createLoaderData());

      render(
        <Home
          loaderData={loaderData}
          actionData={createActionData()}
          params={createParameters()}
          matches={createMatches(loaderData)}
        />,
      );

      expect(
        screen.getByText('毎月1本、みんなで同じ映画を観る'),
      ).toBeInTheDocument();
    });

    it('月替わりに投稿された記事・ポストを出す', () => {
      const loaderData = cast<ComponentProperties['loaderData']>(
        createLoaderData({
          movies: {
            ...mockMovies,
            monthly: {
              ...mockMovies.monthly,
              articleLinks: [
                {
                  uid: 'link-1',
                  url: 'https://x.com/someone/status/1',
                  title: '@someone のポスト',
                },
              ],
            },
          },
        }),
      );

      render(
        <Home
          loaderData={loaderData}
          actionData={createActionData()}
          params={createParameters()}
          matches={createMatches(loaderData)}
        />,
      );

      expect(
        screen.getByRole('link', {name: '@someone のポスト'}),
      ).toHaveAttribute('href', 'https://x.com/someone/status/1');
    });

    it('h1 に SHINE が表示される', () => {
      const loaderData =
        cast<ComponentProperties['loaderData']>(createLoaderData());

      render(
        <Home
          loaderData={loaderData}
          actionData={createActionData()}
          params={createParameters()}
          matches={createMatches(loaderData)}
        />,
      );

      expect(
        screen.getByRole('heading', {level: 1, name: 'SHINE'}),
      ).toBeInTheDocument();
    });

    it('テーマトグルボタンが表示される', () => {
      const loaderData =
        cast<ComponentProperties['loaderData']>(createLoaderData());

      render(
        <Home
          loaderData={loaderData}
          actionData={createActionData()}
          params={createParameters()}
          matches={createMatches(loaderData)}
        />,
      );

      expect(
        screen.getByRole('button', {name: /テーマを切り替える/}),
      ).toBeInTheDocument();
    });

    it('日次映画タイトルが表示される', () => {
      const loaderData =
        cast<ComponentProperties['loaderData']>(createLoaderData());

      render(
        <Home
          loaderData={loaderData}
          actionData={createActionData()}
          params={createParameters()}
          matches={createMatches(loaderData)}
        />,
      );

      expect(screen.getByText('テスト映画')).toBeInTheDocument();
    });

    it('transformImages のときは日替わり・週替わりのポスターも Image Transformations に通す', () => {
      const loaderData = cast<ComponentProperties['loaderData']>(
        createLoaderData({
          transformImages: true,
          movies: {
            ...mockMovies,
            daily: {
              ...mockMovies.daily,
              posterUrl: 'https://image.tmdb.org/t/p/w500/daily.jpg',
            },
            weekly: {
              ...mockMovies.weekly,
              posterUrl: 'https://image.tmdb.org/t/p/w500/weekly.jpg',
            },
          },
        }),
      );

      render(
        <Home
          loaderData={loaderData}
          actionData={createActionData()}
          params={createParameters()}
          matches={createMatches(loaderData)}
        />,
      );

      expect(screen.getByAltText('テスト映画 poster')).toHaveAttribute(
        'src',
        '/cdn-cgi/image/format=auto,quality=70/posters/w185/daily.jpg',
      );
      expect(screen.getByAltText('週間映画 poster')).toHaveAttribute(
        'src',
        '/cdn-cgi/image/format=auto,quality=70/posters/w185/weekly.jpg',
      );
    });

    it('週次映画タイトルが表示される', () => {
      const loaderData =
        cast<ComponentProperties['loaderData']>(createLoaderData());

      render(
        <Home
          loaderData={loaderData}
          actionData={createActionData()}
          params={createParameters()}
          matches={createMatches(loaderData)}
        />,
      );

      expect(screen.getByText('週間映画')).toBeInTheDocument();
    });

    it('月次映画タイトルが表示される', () => {
      const loaderData =
        cast<ComponentProperties['loaderData']>(createLoaderData());

      render(
        <Home
          loaderData={loaderData}
          actionData={createActionData()}
          params={createParameters()}
          matches={createMatches(loaderData)}
        />,
      );

      expect(screen.getByText('月間映画')).toBeInTheDocument();
    });

    it('管理者ログイン時、カードに編集ページへのリンクが表示される', async () => {
      localStorage.setItem('adminToken', 'test-token');

      try {
        const loaderData =
          cast<ComponentProperties['loaderData']>(createLoaderData());

        render(
          <Home
            loaderData={loaderData}
            actionData={createActionData()}
            params={createParameters()}
            matches={createMatches(loaderData)}
          />,
        );

        const editLinks = await screen.findAllByRole('link', {name: '編集'});
        expect(editLinks).toHaveLength(3);
        expect(editLinks[0]).toHaveAttribute('href', '/admin/movies/movie-3');
      } finally {
        localStorage.removeItem('adminToken');
      }
    });

    it('管理者ログイン時、管理画面へのリンクを出し、ログアウトすると消える', async () => {
      localStorage.setItem('adminToken', 'test-token');

      try {
        const loaderData =
          cast<ComponentProperties['loaderData']>(createLoaderData());

        render(
          <Home
            loaderData={loaderData}
            actionData={createActionData()}
            params={createParameters()}
            matches={createMatches(loaderData)}
          />,
        );

        const adminLink = await screen.findByRole('link', {name: '管理者'});
        expect(adminLink).toHaveAttribute('href', '/admin/movies');

        fireEvent.click(screen.getByRole('button', {name: 'ログアウト'}));

        await waitFor(() => {
          expect(
            screen.queryByRole('link', {name: '管理者'}),
          ).not.toBeInTheDocument();
        });
        expect(localStorage.getItem('adminToken')).toBeNull();
      } finally {
        localStorage.removeItem('adminToken');
      }
    });

    it('未ログイン時、編集リンクは表示されない', () => {
      const loaderData =
        cast<ComponentProperties['loaderData']>(createLoaderData());

      render(
        <Home
          loaderData={loaderData}
          actionData={createActionData()}
          params={createParameters()}
          matches={createMatches(loaderData)}
        />,
      );

      expect(
        screen.queryByRole('link', {name: '編集'}),
      ).not.toBeInTheDocument();
    });

    it('エラー状態が正常に表示される', () => {
      const loaderData = cast<ComponentProperties['loaderData']>(
        createErrorLoaderData({
          error: 'APIへの接続に失敗しました',
        }),
      );

      render(
        <Home
          loaderData={loaderData}
          actionData={createActionData()}
          params={createParameters()}
          matches={createMatches(loaderData)}
        />,
      );

      expect(
        screen.getByText(
          /APIから映画データを取得できませんでした。エラー: APIへの接続に失敗しました/,
        ),
      ).toBeInTheDocument();
    });

    it('クライアント再取得に失敗してもダミー映画を表示しない', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockRejectedValue(new Error('Network error'));

      const loaderData = cast<ComponentProperties['loaderData']>(
        createErrorLoaderData(),
      );

      render(
        <Home
          loaderData={loaderData}
          actionData={createActionData()}
          params={createParameters()}
          matches={createMatches(loaderData)}
        />,
      );

      await waitFor(() => {
        expect(
          screen.getByText(/APIから映画データを取得できませんでした/),
        ).toBeInTheDocument();
      });

      expect(
        screen.queryByText(/The Shawshank Redemption/),
      ).not.toBeInTheDocument();
    });
  });
});

describe('Home の読み込み', () => {
  it('管理用の部品は静的に import せず、ログインした人だけが読み込む', () => {
    expect(homeSource).not.toMatch(
      /^import[^;]*from '@\/components\/(?:admin|molecules\/admin-login)[^']*';/m,
    );
  });
});
