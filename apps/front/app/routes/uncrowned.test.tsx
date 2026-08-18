import '@testing-library/jest-dom';
import {render, screen, within} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import UncrownedPage, {loader, meta} from './uncrowned';
import type {Route} from './+types/uncrowned';
import {createMockContext} from '@/lib/test-context';

globalThis.fetch = vi.fn();

const mockUncrowned = {
  nominatedFilmCount: 6506,
  uncrownedFilmCount: 6008,
  awards: [
    {
      slug: 'palme-dor',
      name: 'パルム・ドール',
      shortLabel: 'カンヌ',
      organization: 'カンヌ国際映画祭',
    },
    {
      slug: 'academy-best-picture',
      name: '作品賞',
      shortLabel: 'アカデミー',
      organization: 'アカデミー賞',
    },
  ],
  topMovies: [
    {
      uid: 'movie-1',
      title: '十五才 学校IV',
      year: 2000,
      posterUrl: 'https://example.com/1.jpg',
      losses: [
        {slug: 'palme-dor', year: 2019},
        {slug: 'academy-best-picture', year: 2020},
      ],
    },
    {
      uid: 'movie-2',
      title: 'ローマの休日',
      year: 1953,
      posterUrl: 'https://example.com/2.jpg',
      losses: [{slug: 'academy-best-picture', year: 1954}],
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
  cast<LoaderData>({...mockUncrowned, locale: 'ja' as const});

function renderPage() {
  render(
    <UncrownedPage
      loaderData={loaderData()}
      actionData={undefined}
      params={cast<ComponentProperties['params']>({})}
      matches={cast<ComponentProperties['matches']>([])}
    />,
  );
}

describe('Uncrowned page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('loader', () => {
    it('APIから無冠の映画を取得して返す', async () => {
      vi.mocked(fetch).mockResolvedValue(
        cast<Response>({
          ok: true,
          async json() {
            return mockUncrowned;
          },
        }),
      );

      const result = await loader(
        createLoaderArguments(
          createMockContext(),
          new Request('https://shine-film.com/uncrowned'),
        ),
      );

      expect(result.topMovies).toHaveLength(2);
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:8787/uncrowned',
        expect.anything(),
      );
    });

    it('APIが失敗したら502を投げる', async () => {
      vi.mocked(fetch).mockResolvedValue(cast<Response>({ok: false}));

      await expect(
        loader(
          createLoaderArguments(
            createMockContext(),
            new Request('https://shine-film.com/uncrowned'),
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
          location: {pathname: '/uncrowned', search: '', hash: ''},
          matches: [],
        }),
      );

      expect(descriptors).toContainEqual({title: '無冠の映画 | SHINE'});
    });
  });

  describe('Component', () => {
    it('無冠の映画の総数を出す', () => {
      renderPage();

      expect(screen.getByText(/6,008/)).toBeInTheDocument();
    });

    it('無冠の映画の割合を出す', () => {
      renderPage();

      expect(screen.getByText(/92.3%/)).toBeInTheDocument();
    });

    it('最も多く敗れた映画を見出しに出す', () => {
      renderPage();

      expect(
        screen.getByRole('heading', {level: 2, name: /十五才 学校IV/}),
      ).toBeInTheDocument();
    });

    it('その映画の敗北数を出す', () => {
      renderPage();

      const hero = screen
        .getByText('最も多く敗れた映画')
        .closest('section') as HTMLElement;

      expect(within(hero).getByText('2')).toBeInTheDocument();
    });

    it('敗北した賞と年のタグを出す', () => {
      renderPage();

      const hero = screen
        .getByText('最も多く敗れた映画')
        .closest('section') as HTMLElement;
      const tags = within(hero).getAllByText(/(カンヌ|アカデミー) \d{4}/);

      expect(tags.map(tag => tag.textContent)).toEqual([
        'カンヌ 2019',
        'アカデミー 2020',
      ]);
    });

    it('上位の映画に詳細ページへのリンクを張る', () => {
      renderPage();

      expect(screen.getByRole('link', {name: /ローマの休日/})).toHaveAttribute(
        'href',
        '/movies/movie-2',
      );
    });

    it('賞の一覧ページへ戻る導線を置く', () => {
      renderPage();

      expect(
        screen.getByRole('link', {name: '映画賞・リスト一覧'}),
      ).toHaveAttribute('href', '/awards');
    });
  });
});
