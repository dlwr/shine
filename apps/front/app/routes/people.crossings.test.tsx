import '@testing-library/jest-dom';
import {render, screen, within} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import PeopleCrossingsPage, {loader, meta} from './people.crossings';
import type {Route} from './+types/people.crossings';
import {createMockContext} from '@/lib/test-context';

vi.stubGlobal('fetch', vi.fn());

const mockCrossings = {
  organizations: [
    {
      key: 'japan-academy',
      name: '日本アカデミー賞',
      shortLabel: '日本アカデミー',
      performanceCount: 280,
    },
    {
      key: 'kinema-junpo',
      name: 'キネマ旬報',
      shortLabel: 'キネ旬',
      performanceCount: 520,
    },
    {
      key: 'mainichi',
      name: '毎日映画コンクール',
      shortLabel: '毎日',
      performanceCount: 500,
    },
  ],
  pairs: [
    {a: 'kinema-junpo', b: 'mainichi', shared: 300},
    {a: 'japan-academy', b: 'kinema-junpo', shared: 120},
  ],
  distribution: [
    {organizationCount: 5, performanceCount: 19},
    {organizationCount: 4, performanceCount: 63},
    {organizationCount: 1, performanceCount: 2276},
  ],
  topPerformances: [
    {
      person: {uid: 'person-1', name: '佐藤二朗', profilePath: '/sato.jpg'},
      movie: {
        uid: 'movie-1',
        title: '爆弾',
        year: 2025,
        posterUrl: 'https://example.com/1.jpg',
      },
      awards: [
        {
          slug: 'japan-academy-lead-actor',
          organization: '日本アカデミー賞',
          category: '主演男優賞',
        },
        {
          slug: 'kinema-junpo-lead-actor',
          organization: 'キネマ旬報',
          category: '主演男優賞',
        },
        {
          slug: 'mainichi-lead-actor',
          organization: '毎日映画コンクール',
          category: '男優主演賞',
        },
      ],
      organizationCount: 5,
    },
    {
      person: {uid: 'person-2', name: '役所広司'},
      movie: {uid: 'movie-2', title: 'Shall we ダンス？', year: 1996},
      awards: [
        {
          slug: 'kinema-junpo-lead-actor',
          organization: 'キネマ旬報',
          category: '主演男優賞',
        },
      ],
      organizationCount: 5,
    },
    {
      person: {uid: 'person-3', name: '河合優実'},
      movie: {uid: 'movie-3', title: 'あんのこと', year: 2024},
      awards: [
        {
          slug: 'kinema-junpo-lead-actress',
          organization: 'キネマ旬報',
          category: '主演女優賞',
        },
      ],
      organizationCount: 4,
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
): LoaderArguments =>
  cast<LoaderArguments>({
    context,
    request,
    params: {},
    matches: [],
  });

const loaderData = () =>
  cast<LoaderData>({...mockCrossings, locale: 'ja' as const});

function renderPage() {
  render(
    <PeopleCrossingsPage
      loaderData={loaderData()}
      actionData={undefined}
      params={cast<ComponentProperties['params']>({})}
      matches={cast<ComponentProperties['matches']>([])}
    />,
  );
}

function heroSection(): HTMLElement {
  return screen
    .getByText('最も多くの団体に選ばれた演技・演出')
    .closest('section') as HTMLElement;
}

describe('People crossings page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('loader', () => {
    it('APIから個人賞の重なりを取得して返す', async () => {
      vi.mocked(fetch).mockResolvedValue(
        cast<Response>({
          ok: true,
          async json() {
            return mockCrossings;
          },
        }),
      );

      const result = await loader(
        createLoaderArguments(
          createMockContext(),
          new Request('https://shine-film.com/people/crossings'),
        ),
      );

      expect(result.organizations).toHaveLength(3);
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:8787/people/crossings?locale=ja',
        expect.anything(),
      );
    });

    it('APIが失敗したら502を投げる', async () => {
      vi.mocked(fetch).mockResolvedValue(cast<Response>({ok: false}));

      await expect(
        loader(
          createLoaderArguments(
            createMockContext(),
            new Request('https://shine-film.com/people/crossings'),
          ),
        ),
      ).rejects.toThrow();
    });
  });

  describe('meta', () => {
    it('タイトルを返す', () => {
      const descriptors = meta(
        cast<Route.MetaArgs>({
          loaderData: loaderData(),
          params: {},
          location: {pathname: '/people/crossings', search: '', hash: ''},
          matches: [],
        }),
      );

      expect(descriptors).toContainEqual({title: '映画人の交差 | SHINE'});
    });
  });

  describe('Component', () => {
    it('最も多くの団体に選ばれた演技を同率で全て見出しに出す', () => {
      renderPage();

      const hero = heroSection();
      expect(
        within(hero).getByRole('link', {name: '佐藤二朗'}),
      ).toHaveAttribute('href', '/people/person-1');
      expect(
        within(hero).getByRole('link', {name: '役所広司'}),
      ).toHaveAttribute('href', '/people/person-2');
      expect(
        within(hero).queryByRole('link', {name: '河合優実'}),
      ).not.toBeInTheDocument();
    });

    it('最多の団体数を冠の数として出す', () => {
      renderPage();

      expect(within(heroSection()).getByText('5冠')).toBeInTheDocument();
    });

    it('演技の作品に作品ページへのリンクを張る', () => {
      renderPage();

      expect(
        within(heroSection()).getByRole('link', {name: /爆弾/}),
      ).toHaveAttribute('href', '/movies/movie-1');
    });

    it('選ばれた部門のタグに賞ページへのリンクを張る', () => {
      renderPage();

      expect(
        within(heroSection()).getByRole('link', {name: '毎日 男優主演賞'}),
      ).toHaveAttribute('href', '/awards/mainichi-lead-actor');
    });

    it('団体の数ごとの件数を出す', () => {
      renderPage();

      expect(screen.getByText('2,276')).toBeInTheDocument();
    });

    it('重なりの表を出す', () => {
      renderPage();

      expect(screen.getByTitle('キネ旬 × 毎日 300件')).toBeInTheDocument();
    });

    it('次の階層の演技に人物ページへのリンクを張る', () => {
      renderPage();

      expect(screen.getByRole('link', {name: '河合優実'})).toHaveAttribute(
        'href',
        '/people/person-3',
      );
    });

    it('映画人ランキングへの導線を置く', () => {
      renderPage();

      expect(
        screen.getByRole('link', {name: '映画人ランキング'}),
      ).toHaveAttribute('href', '/people');
    });

    it('映画の賞の交差への導線を置く', () => {
      renderPage();

      expect(
        screen.getByRole('link', {name: '映画の賞の交差'}),
      ).toHaveAttribute('href', '/crossings');
    });
  });
});
