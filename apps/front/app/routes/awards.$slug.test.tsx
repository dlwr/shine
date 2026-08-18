import '@testing-library/jest-dom';
import {render, screen} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import AwardDetailPage, {loader, meta} from './awards.$slug';
import type {Route} from './+types/awards.$slug';
import {createMockContext} from '@/lib/test-context';

globalThis.fetch = vi.fn();

const mockAwardDetail = {
  slug: 'palme-dor',
  name: 'パルム・ドール',
  organization: 'カンヌ国際映画祭',
  description:
    'カンヌ国際映画祭の最高賞パルム・ドールの歴代受賞作と公式出品作の一覧。',
  grouping: 'year' as const,
  years: [
    {
      year: 2023,
      ceremonyNumber: 76,
      filmCount: 21,
      movies: [
        {
          uid: 'movie-winner',
          title: '落下の解剖学',
          movieYear: 2023,
          posterUrl: 'https://example.com/poster.jpg',
          isWinner: true,
        },
      ],
    },
    {
      year: 2022,
      ceremonyNumber: 75,
      filmCount: 18,
      movies: [
        {
          uid: 'movie-2022',
          title: '逆転のトライアングル',
          movieYear: 2022,
          posterUrl: undefined,
          isWinner: true,
        },
      ],
    },
    {
      year: 2021,
      ceremonyNumber: 74,
      filmCount: 24,
      movies: [
        {
          uid: 'movie-2021',
          title: 'TITANE/チタン',
          movieYear: 2021,
          posterUrl: undefined,
          isWinner: true,
        },
      ],
    },
  ],
};

const cast = <T,>(value?: unknown): T => value as T;

type LoaderArguments = Route.LoaderArgs;
type ComponentProperties = Route.ComponentProps;
type LoaderData = ComponentProperties['loaderData'];

const createLoaderArguments = (
  context: unknown,
  request: Request,
  parameters: Record<string, string>,
): LoaderArguments =>
  cast<LoaderArguments>({
    context,
    request,
    params: parameters,
    matches: [],
  });

const createComponentProperties = (
  loaderData: LoaderData,
): ComponentProperties =>
  cast<ComponentProperties>({
    loaderData,
    params: {slug: 'palme-dor'},
    matches: [],
  });

describe('Award detail page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('loader', () => {
    it('APIから賞の詳細を取得する', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockAwardDetail,
      } as Response);

      const request = new Request('http://localhost:3000/awards/palme-dor');
      const result = await loader(
        createLoaderArguments(createMockContext(), request, {
          slug: 'palme-dor',
        }),
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8787/awards/palme-dor?page=1',
        {signal: request.signal},
      );
      expect(result).toEqual({award: mockAwardDetail, locale: 'ja'});
    });

    it('APIが404を返したら404 Responseをthrowする', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({error: 'Award not found'}),
      } as Response);

      const request = new Request('http://localhost:3000/awards/unknown');

      await expect(
        loader(
          createLoaderArguments(createMockContext(), request, {
            slug: 'unknown',
          }),
        ),
      ).rejects.toMatchObject({status: 404});
    });
  });

  describe('meta', () => {
    it('年グルーピングの賞は歴代一覧のタイトルを組み立てる', () => {
      const metaArguments = cast<Route.MetaArgs>({
        loaderData: {award: mockAwardDetail, locale: 'ja'},
        params: {slug: 'palme-dor'},
        location: {
          pathname: '/awards/palme-dor',
          search: '',
          hash: '',
          state: undefined,
          key: 'test',
        },
        matches: [],
      });

      const descriptors = meta(metaArguments);
      const titleDescriptor = descriptors.find(
        descriptor => 'title' in descriptor,
      ) as {title: string};

      expect(titleDescriptor.title).toBe(
        'カンヌ国際映画祭 パルム・ドール 歴代受賞作一覧（2021–2023） | SHINE',
      );
    });
  });

  describe('component', () => {
    it('年を降順で表示する', () => {
      render(
        <AwardDetailPage
          {...createComponentProperties(
            cast<LoaderData>({award: mockAwardDetail, locale: 'ja'}),
          )}
        />,
      );

      const headings = screen.getAllByRole('heading', {level: 2});
      const yearTexts = headings
        .map(heading => heading.textContent)
        .filter(text => /^\d{4}$/.test(text ?? ''));
      expect(yearTexts).toEqual(['2023', '2022', '2021']);
    });

    it('受賞作にWINNERバッジを表示する', () => {
      render(
        <AwardDetailPage
          {...createComponentProperties(
            cast<LoaderData>({award: mockAwardDetail, locale: 'ja'}),
          )}
        />,
      );

      expect(screen.getByText('落下の解剖学')).toBeInTheDocument();
      expect(screen.getAllByText('WINNER')).toHaveLength(3);
    });

    it('各年から出品作一覧へのリンクを表示する', () => {
      render(
        <AwardDetailPage
          {...createComponentProperties(
            cast<LoaderData>({award: mockAwardDetail, locale: 'ja'}),
          )}
        />,
      );

      const link = screen.getByRole('link', {name: /出品作21本を見る/});
      expect(link).toHaveAttribute('href', '/awards/palme-dor/2023');
    });

    it('受賞作がない年は受賞作なしと表示する', () => {
      const award = {
        ...mockAwardDetail,
        years: [{year: 1970, ceremonyNumber: 20, filmCount: 22, movies: []}],
      };

      render(
        <AwardDetailPage
          {...createComponentProperties(
            cast<LoaderData>({award, locale: 'ja'}),
          )}
        />,
      );

      expect(screen.getByText('受賞作なし')).toBeInTheDocument();
    });

    it('リスト型の賞ではページ送りを表示する', () => {
      const award = {
        ...mockAwardDetail,
        slug: '1001-movies',
        grouping: 'list' as const,
        years: [
          {
            year: 2025,
            ceremonyNumber: undefined,
            filmCount: 150,
            movies: [
              {
                uid: 'movie-list',
                title: '市民ケーン',
                movieYear: 1941,
                posterUrl: undefined,
                isWinner: false,
              },
            ],
          },
        ],
        pagination: {page: 1, perPage: 100, totalCount: 150, totalPages: 2},
      };

      render(
        <AwardDetailPage
          {...createComponentProperties(
            cast<LoaderData>({award, locale: 'ja'}),
          )}
        />,
      );

      const next = screen.getByRole('link', {name: /次の100件/});
      expect(next).toHaveAttribute('href', '/awards/1001-movies?page=2');
    });

    it('最終ページでは次へのリンクを出さない', () => {
      const award = {
        ...mockAwardDetail,
        slug: '1001-movies',
        grouping: 'list' as const,
        years: [
          {
            year: 2025,
            ceremonyNumber: undefined,
            filmCount: 150,
            movies: [],
          },
        ],
        pagination: {page: 2, perPage: 100, totalCount: 150, totalPages: 2},
      };

      render(
        <AwardDetailPage
          {...createComponentProperties(
            cast<LoaderData>({award, locale: 'ja'}),
          )}
        />,
      );

      expect(screen.queryByRole('link', {name: /次の100件/})).toBeNull();
      expect(screen.getByRole('link', {name: /前の100件/})).toHaveAttribute(
        'href',
        '/awards/1001-movies',
      );
    });

    it('各作品が映画詳細ページへリンクする', () => {
      render(
        <AwardDetailPage
          {...createComponentProperties(
            cast<LoaderData>({award: mockAwardDetail, locale: 'ja'}),
          )}
        />,
      );

      const winnerLink = screen.getByRole('link', {name: /落下の解剖学/});
      expect(winnerLink).toHaveAttribute('href', '/movies/movie-winner');
    });
  });
});
