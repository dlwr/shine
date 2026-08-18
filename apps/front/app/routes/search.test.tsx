import '@testing-library/jest-dom';
import {render, screen} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import Search, {loader, meta} from './search';
import type {Route} from './+types/search';
import {createMockContext} from '@/lib/test-context';

// Fetchのモック
vi.stubGlobal('fetch', vi.fn());

// Cloudflare環境のモック

// 検索結果のモックデータ
const mockSearchResults = {
  movies: [
    {
      uid: 'movie-1',
      year: 2023,
      originalLanguage: 'ja',
      imdbId: 'tt1234567',
      title: '検索結果映画1',
      posterUrls: [
        {
          url: 'https://example.com/poster1.jpg',
          isPrimary: 1,
        },
      ],
      hasNominations: true,
    },
    {
      uid: 'movie-2',
      year: 2022,
      originalLanguage: 'ja',
      imdbId: 'tt7654321',
      title: '検索結果映画2',
      posterUrls: [],
      hasNominations: false,
    },
  ],
  pagination: {
    currentPage: 1,
    totalPages: 1,
    totalCount: 2,
    hasNextPage: false,
    hasPrevPage: false,
  },
};

const cast = <T,>(value?: unknown): T => value as T;

describe('Search Component', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  type LoaderArguments = Route.LoaderArgs;
  type MetaArguments = Route.MetaArgs;
  type ComponentProperties = Route.ComponentProps;
  type LoaderData = ComponentProperties['loaderData'];
  type Matches = ComponentProperties['matches'];

  const createLoaderArguments = (
    context: LoaderArguments['context'],
    request: LoaderArguments['request'],
    parameters: LoaderArguments['params'],
  ): LoaderArguments =>
    cast<LoaderArguments>({
      context,
      request,
      params: parameters,
      matches: [],
    });

  const createMetaArguments = (
    loaderData: LoaderData,
    locationSearch: string,
  ): MetaArguments =>
    cast<MetaArguments>({
      loaderData,
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
    overrides: Partial<LoaderData> = {},
  ): LoaderData => ({
    searchQuery: '',
    searchResults: undefined,
    locale: 'ja',
    ...overrides,
  });

  const createParameters = (): ComponentProperties['params'] =>
    cast<ComponentProperties['params']>({});

  const createMatches = (loaderData: LoaderData): Matches =>
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
        loaderData: loaderData as NonNullable<Matches[number]>['loaderData'],
        handle: undefined,
      },
    ]);

  const createActionData = (): ComponentProperties['actionData'] =>
    cast<ComponentProperties['actionData']>();

  describe('loader', () => {
    it('検索クエリありの場合は検索結果を取得する', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSearchResults,
      } as Response);

      const context = createMockContext();
      const url = new URL('http://localhost:3000/search?q=test');
      const request = new Request(url);

      const result = await loader(createLoaderArguments(context, request, {}));

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8787/movies/search?q=test&page=1&limit=20',
        {
          signal: request.signal,
        },
      );
      expect(result).toEqual({
        searchQuery: 'test',
        searchResults: mockSearchResults,
        locale: 'ja',
      });
    });

    it('検索クエリなしの場合は空の結果を返す', async () => {
      const context = createMockContext();
      const url = new URL('http://localhost:3000/search');
      const request = new Request(url);

      const result = await loader(createLoaderArguments(context, request, {}));

      expect(result).toEqual({
        searchQuery: '',
        searchResults: undefined,
        locale: 'ja',
      });
    });

    it('API接続エラーの場合はエラー情報を返す', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const context = createMockContext();
      const url = new URL('http://localhost:3000/search?q=test');
      const request = new Request(url);

      const result = await loader(createLoaderArguments(context, request, {}));

      expect(result).toEqual({
        searchQuery: 'test',
        error: '検索に失敗しました',
        locale: 'ja',
      });
    });
  });

  describe('meta', () => {
    it('検索クエリありの場合は検索クエリを含むタイトルを返す', () => {
      const loaderData = cast<LoaderData>({
        searchQuery: 'test movie',
        searchResults: mockSearchResults,
        locale: 'ja',
      });

      const result = meta(createMetaArguments(loaderData, '?q=test%20movie'));

      expect(result).toContainEqual({
        title: '「test movie」の検索結果 | SHINE',
      });
    });

    it('検索クエリなしの場合はデフォルトのタイトルを返す', () => {
      const loaderData = cast<LoaderData>({
        searchQuery: '',
        searchResults: undefined,
        locale: 'ja',
      });

      const result = meta(createMetaArguments(loaderData, '?q=test%20movie'));

      expect(result).toContainEqual({title: '映画を検索 | SHINE'});
    });

    it('検索結果ページは検索エンジンにインデックスさせない', () => {
      const loaderData = cast<LoaderData>({
        searchQuery: 'test movie',
        searchResults: mockSearchResults,
        locale: 'ja',
      });

      const result = meta(createMetaArguments(loaderData, '?q=test%20movie'));

      expect(result).toContainEqual({
        name: 'robots',
        content: 'noindex, follow',
      });
    });

    it('og:urlに検索ページのURLを返す', () => {
      const loaderData = cast<LoaderData>({
        searchQuery: '',
        searchResults: undefined,
        locale: 'ja',
      });

      const result = meta(createMetaArguments(loaderData, ''));

      expect(result).toContainEqual({
        property: 'og:url',
        content: 'https://shine-film.com/search',
      });
    });
  });

  describe('Component', () => {
    it('検索フォームが正常に表示される', () => {
      const loaderData = createLoaderData();

      render(
        <Search
          loaderData={loaderData}
          actionData={createActionData()}
          params={createParameters()}
          matches={createMatches(loaderData)}
        />,
      );

      expect(screen.getByRole('heading', {name: 'SEARCH'})).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText('映画タイトルを入力...'),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', {name: 'GO'})).toBeInTheDocument();
    });

    it('検索結果が正常に表示される', () => {
      const loaderData = cast<LoaderData>({
        searchQuery: 'test',
        searchResults: mockSearchResults,
      });

      render(
        <Search
          loaderData={loaderData}
          actionData={createActionData()}
          params={createParameters()}
          matches={createMatches(loaderData)}
        />,
      );

      expect(screen.getByText('2 RESULTS')).toBeInTheDocument();
      expect(
        screen.getByRole('link', {name: /検索結果映画1/}),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('link', {name: /検索結果映画2/}),
      ).toBeInTheDocument();
    });

    it('検索結果なしの場合は適切なメッセージが表示される', () => {
      const loaderData = cast<LoaderData>({
        searchQuery: 'nomatch',
        searchResults: {
          movies: [],
          pagination: {
            currentPage: 1,
            totalPages: 0,
            totalCount: 0,
            hasNextPage: false,
            hasPrevPage: false,
          },
        },
      });

      render(
        <Search
          loaderData={loaderData}
          actionData={createActionData()}
          params={createParameters()}
          matches={createMatches(loaderData)}
        />,
      );

      expect(
        screen.getByText('検索結果が見つかりませんでした'),
      ).toBeInTheDocument();
    });

    it('エラー状態が正常に表示される', () => {
      const loaderData = cast<LoaderData>({
        searchQuery: 'test',
        error: '検索に失敗しました',
      });

      render(
        <Search
          loaderData={loaderData}
          actionData={createActionData()}
          params={createParameters()}
          matches={createMatches(loaderData)}
        />,
      );

      expect(screen.getByText('検索に失敗しました')).toBeInTheDocument();
    });

    it('映画詳細ページへのリンクが正しく設定される', () => {
      const loaderData = cast<LoaderData>({
        searchQuery: 'test',
        searchResults: mockSearchResults,
      });

      render(
        <Search
          loaderData={loaderData}
          actionData={createActionData()}
          params={createParameters()}
          matches={createMatches(loaderData)}
        />,
      );

      const movieLinks = screen.getAllByRole('link');
      const movieDetailLinks = movieLinks.filter(link =>
        link.getAttribute('href')?.startsWith('/movies/'),
      );

      expect(movieDetailLinks[0]).toHaveAttribute('href', '/movies/movie-1');
      expect(movieDetailLinks[1]).toHaveAttribute('href', '/movies/movie-2');
    });
  });
});
