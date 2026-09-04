import '@testing-library/jest-dom';
import {render, screen, within} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import PeoplePage, {loader, meta} from './people';
import type {Route} from './+types/people';
import {createMockContext} from '@/lib/test-context';

vi.stubGlobal('fetch', vi.fn());

const mockProminent = {
  directors: [
    {
      uid: 'person-eastwood',
      name: 'クリント・イーストウッド',
      originalName: 'Clint Eastwood',
      profilePath: '/eastwood.jpg',
      wonCount: 10,
      nominatedCount: 21,
      topMovies: [{uid: 'movie-sully', title: 'ハドソン川の奇跡', year: 2016}],
    },
    {
      uid: 'person-kurosawa',
      name: '黒澤明',
      originalName: '黒澤明',
      wonCount: 8,
      nominatedCount: 25,
      topMovies: [{uid: 'movie-ran', title: '乱', year: 1985}],
    },
  ],
  actors: [
    {
      uid: 'person-sato',
      name: '佐藤浩市',
      originalName: '佐藤浩市',
      profilePath: '/sato.jpg',
      wonCount: 13,
      nominatedCount: 37,
      topMovies: [{uid: 'movie-okiku', title: 'せかいのおきく', year: 2023}],
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
  cast<LoaderData>({...mockProminent, locale: 'ja' as const});

function renderPage() {
  render(
    <PeoplePage
      loaderData={loaderData()}
      actionData={undefined}
      params={cast<ComponentProperties['params']>({})}
      matches={cast<ComponentProperties['matches']>([])}
    />,
  );
}

describe('People page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('loader', () => {
    it('APIからランキングを取得して返す', async () => {
      vi.mocked(fetch).mockResolvedValue(
        cast<Response>({
          ok: true,
          async json() {
            return mockProminent;
          },
        }),
      );

      const result = await loader(
        createLoaderArguments(
          createMockContext(),
          new Request('https://shine-film.com/people'),
        ),
      );

      expect(result.directors).toHaveLength(2);
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:8787/people/prominent?locale=ja',
        expect.anything(),
      );
    });

    it('APIが失敗したら502を投げる', async () => {
      vi.mocked(fetch).mockResolvedValue(cast<Response>({ok: false}));

      await expect(
        loader(
          createLoaderArguments(
            createMockContext(),
            new Request('https://shine-film.com/people'),
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
          location: {pathname: '/people', search: '', hash: ''},
          matches: [],
        }),
      );

      expect(descriptors).toContainEqual({title: '映画人 | なんか見る'});
    });
  });

  describe('Component', () => {
    it('映画人を検索するフォームを出す', () => {
      renderPage();

      const input = screen.getByRole('searchbox', {name: '映画人を探す'});
      expect(input).toHaveAttribute('name', 'q');
      expect(input.closest('form')).toHaveAttribute('action', '/search');
    });

    it('監督の名前を出す', () => {
      renderPage();

      expect(screen.getByText('クリント・イーストウッド')).toBeInTheDocument();
    });

    it('監督の受賞回数を出す', () => {
      renderPage();

      const row = screen.getByRole('listitem', {
        name: 'クリント・イーストウッド',
      });
      expect(within(row).getByText('10')).toBeInTheDocument();
      expect(
        within(row).getByText(/回受賞 \/ 21回ノミネート/),
      ).toBeInTheDocument();
    });

    it('監督の代表作を出す', () => {
      renderPage();

      expect(
        screen.getByRole('link', {name: /ハドソン川の奇跡/}),
      ).toHaveAttribute('href', '/movies/movie-sully');
    });

    it('人物ページへリンクする', () => {
      renderPage();

      expect(
        screen.getByRole('link', {name: 'クリント・イーストウッド'}),
      ).toHaveAttribute('href', '/people/person-eastwood');
    });

    it('俳優の名前を出す', () => {
      renderPage();

      expect(screen.getByText('佐藤浩市')).toBeInTheDocument();
    });

    it('原語名が違えば併記する', () => {
      renderPage();

      expect(screen.getByText('Clint Eastwood')).toBeInTheDocument();
    });

    it('原語名が同じなら併記しない', () => {
      renderPage();

      expect(screen.queryByText('黒澤明 / 黒澤明')).not.toBeInTheDocument();
    });

    it('映画人の交差への導線を置く', () => {
      renderPage();

      expect(
        screen.getByRole('link', {name: '映画人の交差を見る →'}),
      ).toHaveAttribute('href', '/people/crossings');
    });
  });
});
