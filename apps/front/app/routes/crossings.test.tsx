import '@testing-library/jest-dom';
import {render, screen, within} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import CrossingsPage, {loader, meta} from './crossings';
import type {Route} from './+types/crossings';
import {createMockContext} from '@/lib/test-context';

globalThis.fetch = vi.fn();

const mockCrossings = {
  awards: [
    {
      slug: 'palme-dor',
      name: 'パルム・ドール',
      shortLabel: 'カンヌ',
      organization: 'カンヌ国際映画祭',
      filmCount: 1768,
    },
    {
      slug: 'academy-best-picture',
      name: '作品賞',
      shortLabel: 'アカデミー',
      organization: 'アカデミー賞',
      filmCount: 617,
    },
  ],
  pairs: [{a: 'academy-best-picture', b: 'palme-dor', shared: 62}],
  distribution: [
    {awardCount: 7, filmCount: 1},
    {awardCount: 6, filmCount: 5},
    {awardCount: 1, filmCount: 6155},
  ],
  topMovies: [
    {
      uid: 'movie-1',
      title: 'ドライブ・マイ・カー',
      year: 2021,
      posterUrl: 'https://example.com/1.jpg',
      awardSlugs: [
        'academy-best-picture',
        'brutus-japanese-film',
        'japan-academy-best-picture',
        'kinema-junpo-japanese',
        'palme-dor',
        'popeye-21st-century',
        'time-underappreciated',
      ],
    },
    {
      uid: 'movie-2',
      title: 'パルプ・フィクション',
      year: 1994,
      posterUrl: 'https://example.com/2.jpg',
      awardSlugs: [
        'palme-dor',
        '1001-movies',
        'kinema-junpo-foreign',
        'popeye-21st-century',
        'variety-top-100',
        'brutus-japanese-film',
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
    <CrossingsPage
      loaderData={loaderData()}
      actionData={undefined}
      params={cast<ComponentProperties['params']>({})}
      matches={cast<ComponentProperties['matches']>([])}
    />,
  );
}

describe('Crossings page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('loader', () => {
    it('APIから賞の重なりを取得して返す', async () => {
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
          new Request('https://shine-film.com/crossings'),
        ),
      );

      expect(result.awards).toHaveLength(2);
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:8787/crossings',
        expect.anything(),
      );
    });

    it('APIが失敗したら502を投げる', async () => {
      vi.mocked(fetch).mockResolvedValue(cast<Response>({ok: false}));

      await expect(
        loader(
          createLoaderArguments(
            createMockContext(),
            new Request('https://shine-film.com/crossings'),
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
          location: {pathname: '/crossings', search: '', hash: ''},
          matches: [],
        }),
      );

      expect(descriptors).toContainEqual({title: '賞の交差 | SHINE'});
    });
  });

  describe('Component', () => {
    it('最も多くの賞に選ばれた映画を見出しに出す', () => {
      renderPage();

      expect(
        screen.getByRole('heading', {level: 2, name: /ドライブ・マイ・カー/}),
      ).toBeInTheDocument();
    });

    it('その映画が選ばれた賞の数を出す', () => {
      renderPage();

      expect(screen.getByText('7')).toBeInTheDocument();
    });

    it('選ばれた賞のタグを賞の一覧と同じ順で並べる', () => {
      renderPage();

      const hero = screen
        .getByText('最も多くの賞に選ばれた映画')
        .closest('section') as HTMLElement;
      const tags = within(hero).getAllByText(/^(カンヌ|アカデミー)$/);

      expect(tags.map(tag => tag.textContent)).toEqual([
        'カンヌ',
        'アカデミー',
      ]);
    });

    it('賞の数ごとの本数を出す', () => {
      renderPage();

      expect(screen.getByText('6,155')).toBeInTheDocument();
    });

    it('重なりの表を出す', () => {
      renderPage();

      expect(screen.getByTitle('カンヌ × アカデミー 62本')).toBeInTheDocument();
    });

    it('上位の映画に詳細ページへのリンクを張る', () => {
      renderPage();

      expect(
        screen.getByRole('link', {name: /パルプ・フィクション/}),
      ).toHaveAttribute('href', '/movies/movie-2');
    });

    it('賞の一覧ページへ戻る導線を置く', () => {
      renderPage();

      expect(
        screen.getByRole('link', {name: '映画賞・リスト一覧'}),
      ).toHaveAttribute('href', '/awards');
    });
  });
});
