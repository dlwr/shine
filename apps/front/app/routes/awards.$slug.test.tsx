import '@testing-library/jest-dom';
import {render, screen} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import AwardDetailPage, {loader, meta} from './awards.$slug';
import type {Route} from './+types/awards.$slug';
import {createMockContext} from '@/lib/test-context';

vi.stubGlobal('fetch', vi.fn());

const mockAwardDetail = {
  slug: 'palme-dor',
  name: 'パルム・ドール',
  organization: 'カンヌ国際映画祭',
  description:
    'カンヌ国際映画祭の最高賞パルム・ドールの歴代受賞作と公式出品作の一覧。',
  grouping: 'year' as const,
  availabilitySummary: {
    total: 0,
    watchable: 0,
    rentalOnly: 0,
    unwatchable: 0,
    unchecked: 0,
  },
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
          availabilityStatus: 'watchable',
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

const summary = (slug: string, organization: string) => ({
  slug,
  name: slug,
  organization,
  description: '',
  grouping: 'year',
  movieCount: 1,
  firstYear: 2000,
  lastYear: 2026,
});

describe('Award detail page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('loader', () => {
    it('APIから賞の詳細を取得する', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockImplementation(async input =>
        String(input).endsWith('/awards')
          ? ({ok: false, status: 500} as Response)
          : ({
              ok: true,
              status: 200,
              json: async () => mockAwardDetail,
            } as Response),
      );

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
      expect(result).toEqual({
        award: mockAwardDetail,
        locale: 'ja',
        nextAwards: {sameOrganization: [], otherOrganizations: []},
      });
    });

    it('賞の一覧から次に見る賞を選ぶ', async () => {
      vi.mocked(fetch).mockImplementation(async input =>
        String(input).endsWith('/awards')
          ? ({
              ok: true,
              status: 200,
              json: async () => ({
                awards: [
                  summary('palme-dor', 'カンヌ国際映画祭'),
                  summary('academy-best-picture', 'アカデミー賞'),
                ],
              }),
            } as Response)
          : ({
              ok: true,
              status: 200,
              json: async () => mockAwardDetail,
            } as Response),
      );

      const result = await loader(
        createLoaderArguments(
          createMockContext(),
          new Request('http://localhost:3000/awards/palme-dor'),
          {slug: 'palme-dor'},
        ),
      );

      expect(
        result.nextAwards.otherOrganizations.map(award => award.slug),
      ).toEqual(['academy-best-picture']);
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

    it('説明文の後ろに導入文を続ける', () => {
      const descriptors = meta(
        cast<Route.MetaArgs>({
          loaderData: {award: mockAwardDetail, locale: 'ja'},
        }),
      );
      const description = descriptors.find(
        descriptor => 'name' in descriptor && descriptor.name === 'description',
      ) as {content: string};

      expect(description.content).toBe(
        `${mockAwardDetail.description}最新の受賞作は第76回（2023年）の『落下の解剖学』。2021年から2023年までの受賞作3本を収録。`,
      );
    });
  });

  describe('component', () => {
    it('次に見る賞を賞ページへリンクする', () => {
      render(
        <AwardDetailPage
          {...createComponentProperties(
            cast<LoaderData>({
              award: mockAwardDetail,
              locale: 'ja',
              nextAwards: {
                sameOrganization: [],
                otherOrganizations: [
                  {
                    slug: 'academy-best-picture',
                    name: '作品賞',
                    organization: 'アカデミー賞',
                    description: '',
                    grouping: 'year',
                    movieCount: 1,
                    firstYear: 2000,
                    lastYear: 2026,
                  },
                ],
              },
            }),
          )}
        />,
      );

      expect(
        screen.getByRole('link', {name: 'アカデミー賞 作品賞'}),
      ).toHaveAttribute('href', '/awards/academy-best-picture');
    });

    it('最新の受賞作を書いた導入文を出す', () => {
      render(
        <AwardDetailPage
          {...createComponentProperties(
            cast<LoaderData>({award: mockAwardDetail, locale: 'ja'}),
          )}
        />,
      );

      expect(
        screen.getByText(/最新の受賞作は第76回（2023年）の『落下の解剖学』/),
      ).toBeInTheDocument();
    });

    it('日本で観られる一番新しい受賞作を「まず観るなら」に出す', () => {
      render(
        <AwardDetailPage
          {...createComponentProperties(
            cast<LoaderData>({award: mockAwardDetail, locale: 'ja'}),
          )}
        />,
      );

      const section = screen
        .getByRole('heading', {name: /まず観るなら/})
        .closest('section');
      expect(section?.querySelector('a')).toHaveAttribute(
        'href',
        '/movies/movie-2022',
      );
    });

    it('年度制の賞は観た映画チェックへの導線を出す', () => {
      render(
        <AwardDetailPage
          {...createComponentProperties(
            cast<LoaderData>({award: mockAwardDetail, locale: 'ja'}),
          )}
        />,
      );

      expect(screen.getByRole('link', {name: /何本観た/})).toHaveAttribute(
        'href',
        '/watched/palme-dor',
      );
    });

    it('映画祭のサブ賞とリスト型の賞には観た映画チェックの導線を出さない', () => {
      const {unmount} = render(
        <AwardDetailPage
          {...createComponentProperties(
            cast<LoaderData>({
              award: {...mockAwardDetail, subAward: true},
              locale: 'ja',
            }),
          )}
        />,
      );
      expect(screen.queryByRole('link', {name: /何本観た/})).toBeNull();
      unmount();

      render(
        <AwardDetailPage
          {...createComponentProperties(
            cast<LoaderData>({
              award: {...mockAwardDetail, grouping: 'list'},
              locale: 'ja',
            }),
          )}
        />,
      );
      expect(screen.queryByRole('link', {name: /何本観た/})).toBeNull();
    });

    it('日本で観られる本数と観られない作品の一覧への導線を出す', () => {
      render(
        <AwardDetailPage
          {...createComponentProperties(
            cast<LoaderData>({
              award: {
                ...mockAwardDetail,
                availabilitySummary: {
                  total: 63,
                  watchable: 40,
                  rentalOnly: 3,
                  unwatchable: 15,
                  unchecked: 5,
                },
              },
              locale: 'ja',
            }),
          )}
        />,
      );

      expect(screen.getByText('日本で観られる 40 / 63 本')).toBeInTheDocument();
      expect(
        screen.getByRole('link', {name: '観られない 15 本'}),
      ).toHaveAttribute('href', '/awards/palme-dor/unavailable');
    });

    it('観られない受賞作の行に印を付ける', () => {
      render(
        <AwardDetailPage
          {...createComponentProperties(
            cast<LoaderData>({
              award: {
                ...mockAwardDetail,
                years: [
                  {
                    ...mockAwardDetail.years[0],
                    movies: [
                      {
                        ...mockAwardDetail.years[0].movies[0],
                        availabilityStatus: 'unwatchable',
                      },
                    ],
                  },
                ],
              },
              locale: 'ja',
            }),
          )}
        />,
      );

      expect(screen.getByText('日本で観られない')).toBeInTheDocument();
    });

    it('リスト型の賞でも観られない作品の行に印を付ける', () => {
      render(
        <AwardDetailPage
          {...createComponentProperties(
            cast<LoaderData>({
              award: {
                ...mockAwardDetail,
                grouping: 'list',
                years: [
                  {
                    ...mockAwardDetail.years[0],
                    movies: [
                      {
                        ...mockAwardDetail.years[0].movies[0],
                        availabilityStatus: 'rental_only',
                      },
                    ],
                  },
                ],
              },
              locale: 'ja',
            }),
          )}
        />,
      );

      expect(screen.getByText('宅配レンタルのみ・要確認')).toBeInTheDocument();
    });

    it('リスト型の賞で順位の付いた作品に順位を出す', () => {
      render(
        <AwardDetailPage
          {...createComponentProperties(
            cast<LoaderData>({
              award: {
                ...mockAwardDetail,
                grouping: 'list',
                years: [
                  {
                    ...mockAwardDetail.years[0],
                    movies: [
                      {
                        ...mockAwardDetail.years[0].movies[0],
                        specialMention: '1位',
                      },
                    ],
                  },
                ],
              },
              locale: 'ja',
            }),
          )}
        />,
      );

      expect(screen.getByText('1位')).toBeInTheDocument();
    });

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
      expect(screen.getAllByText('受賞')).toHaveLength(3);
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

    it('受賞作のほかに出品作が無い年は出品作一覧へのリンクを出さない', () => {
      const award = {
        ...mockAwardDetail,
        years: [{...mockAwardDetail.years[0], filmCount: 1}],
      };

      render(
        <AwardDetailPage
          {...createComponentProperties(
            cast<LoaderData>({award, locale: 'ja'}),
          )}
        />,
      );

      expect(screen.queryByRole('link', {name: /出品作/})).toBeNull();
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

const mockPersonAward = {
  slug: 'japan-academy-director',
  name: '最優秀監督賞',
  organization: '日本アカデミー賞',
  description:
    '日本アカデミー賞 最優秀監督賞の歴代受賞者と優秀監督賞ノミネートの一覧。',
  grouping: 'person' as const,
  years: [
    {
      year: 1994,
      ceremonyNumber: 17,
      nominees: [
        {
          uid: 'person-young',
          name: '若手',
          originalName: '若手',
          profilePath: '/young.jpg',
          isWinner: true,
          movies: [{uid: 'movie-d', title: '映画D', movieYear: 1993}],
        },
        {
          uid: 'person-foreign',
          name: 'ジョン・ウー',
          originalName: 'John Woo',
          isWinner: false,
          movies: [{uid: 'movie-c', title: '映画C', movieYear: 1993}],
        },
      ],
    },
    {
      year: 1990,
      ceremonyNumber: 13,
      nominees: [
        {
          uid: 'person-master',
          name: '巨匠',
          originalName: '巨匠',
          isWinner: true,
          movies: [
            {uid: 'movie-a', title: '映画A', movieYear: 1989},
            {uid: 'movie-b', title: '映画B', movieYear: 1989},
          ],
        },
      ],
    },
  ],
};

function renderPersonAward() {
  render(
    <AwardDetailPage
      {...createComponentProperties(
        cast<LoaderData>({award: mockPersonAward, locale: 'ja'}),
      )}
    />,
  );
}

describe('Person award page', () => {
  it('歴代受賞者一覧のタイトルを組み立てる', () => {
    const descriptors = meta(
      cast<Route.MetaArgs>({
        loaderData: {award: mockPersonAward, locale: 'ja'},
        params: {slug: 'japan-academy-director'},
        location: {
          pathname: '/awards/japan-academy-director',
          search: '',
          hash: '',
          state: undefined,
          key: 'test',
        },
        matches: [],
      }),
    );
    const titleDescriptor = descriptors.find(
      descriptor => 'title' in descriptor,
    ) as {title: string};

    expect(titleDescriptor.title).toBe(
      '日本アカデミー賞 最優秀監督賞 歴代受賞者一覧（1990–1994） | SHINE',
    );
  });

  it('受賞者を人物ページへリンクする', () => {
    renderPersonAward();

    expect(screen.getByRole('link', {name: /若手/})).toHaveAttribute(
      'href',
      '/people/person-young',
    );
  });

  it('受賞者にWINNERバッジを表示する', () => {
    renderPersonAward();

    expect(screen.getAllByText('受賞')).toHaveLength(2);
  });

  it('ノミネート作を映画ページへリンクする', () => {
    renderPersonAward();

    expect(screen.getByRole('link', {name: '映画C'})).toHaveAttribute(
      'href',
      '/movies/movie-c',
    );
  });

  it('複数作品が紐づく受賞は作品を並べて出す', () => {
    renderPersonAward();

    expect(screen.getByRole('link', {name: '映画A'})).toBeInTheDocument();
    expect(screen.getByRole('link', {name: '映画B'})).toBeInTheDocument();
  });

  it('原語名が違えば併記する', () => {
    renderPersonAward();

    expect(screen.getByText('John Woo')).toBeInTheDocument();
  });

  it('年ページへのリンクは出さない', () => {
    renderPersonAward();

    expect(screen.queryByText(/を見る →/)).not.toBeInTheDocument();
  });

  it('受賞者数を出す', () => {
    renderPersonAward();

    expect(
      screen.getByText('1990–1994 受賞 2 人・ノミネート 3 人'),
    ).toBeInTheDocument();
  });
});
