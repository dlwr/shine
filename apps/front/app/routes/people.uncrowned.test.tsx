import '@testing-library/jest-dom';
import {render, screen, within} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import PeopleUncrownedPage, {loader, meta} from './people.uncrowned';
import type {Route} from './+types/people.uncrowned';
import {createMockContext} from '@/lib/test-context';

vi.stubGlobal('fetch', vi.fn());

const mockUncrowned = {
  nominatedPersonCount: 1000,
  uncrownedPersonCount: 250,
  awards: [
    {
      slug: 'academy-director',
      name: '監督賞',
      shortLabel: 'アカデミー',
      organization: 'アカデミー賞',
    },
    {
      slug: 'japan-academy-lead-actor',
      name: '最優秀主演男優賞',
      shortLabel: '日本アカデミー',
      organization: '日本アカデミー賞',
    },
  ],
  topPeople: [
    {
      uid: 'person-1',
      name: '三連敗の監督',
      profilePath: '/three.jpg',
      losses: [
        {slug: 'academy-director', year: 1994},
        {slug: 'academy-director', year: 1999},
        {slug: 'japan-academy-lead-actor', year: 2001},
      ],
    },
    {
      uid: 'person-2',
      name: '二連敗の俳優',
      losses: [
        {slug: 'japan-academy-lead-actor', year: 2010},
        {slug: 'japan-academy-lead-actor', year: 2012},
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
  cast<LoaderData>({...mockUncrowned, locale: 'ja' as const});

function renderPage() {
  render(
    <PeopleUncrownedPage
      loaderData={loaderData()}
      actionData={undefined}
      params={cast<ComponentProperties['params']>({})}
      matches={cast<ComponentProperties['matches']>([])}
    />,
  );
}

function heroSection(): HTMLElement {
  return screen
    .getByText('最も多く敗れた映画人')
    .closest('section') as HTMLElement;
}

describe('People uncrowned page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('loader', () => {
    it('APIから無冠の映画人を取得して返す', async () => {
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
          new Request('https://shine-film.com/people/uncrowned'),
        ),
      );

      expect(result.topPeople).toHaveLength(2);
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:8787/people/uncrowned?locale=ja',
        expect.anything(),
      );
    });

    it('APIが失敗したら502を投げる', async () => {
      vi.mocked(fetch).mockResolvedValue(cast<Response>({ok: false}));

      await expect(
        loader(
          createLoaderArguments(
            createMockContext(),
            new Request('https://shine-film.com/people/uncrowned'),
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
          location: {pathname: '/people/uncrowned', search: '', hash: ''},
          matches: [],
        }),
      );

      expect(descriptors).toContainEqual({title: '無冠の映画人 | SHINE'});
    });
  });

  describe('Component', () => {
    it('最も多く敗れた映画人を見出しに出す', () => {
      const hero = (renderPage(), heroSection());

      expect(within(hero).getByText('3')).toBeInTheDocument();
      const links = within(hero).getAllByRole('link', {name: '三連敗の監督'});
      for (const link of links) {
        expect(link).toHaveAttribute('href', '/people/person-1');
      }
    });

    it('無冠の割合を出す', () => {
      renderPage();

      expect(screen.getByText('250人')).toBeInTheDocument();
      expect(screen.getByText('25.0%')).toBeInTheDocument();
    });

    it('敗れた賞を賞ページへのリンクとして出す', () => {
      renderPage();

      const hero = heroSection();
      expect(
        within(hero).getByRole('link', {name: 'アカデミー監督賞 1994'}),
      ).toHaveAttribute('href', '/awards/academy-director');
    });

    it('残りの映画人を敗北数付きで並べる', () => {
      renderPage();

      expect(screen.getByText('2敗')).toBeInTheDocument();
      expect(screen.getByRole('link', {name: /二連敗の俳優/})).toHaveAttribute(
        'href',
        '/people/person-2',
      );
    });

    it('関連ページへのリンクを出す', () => {
      renderPage();

      expect(screen.getByRole('link', {name: '無冠の映画'})).toHaveAttribute(
        'href',
        '/uncrowned',
      );
      expect(
        screen.getByRole('link', {name: '映画人ランキング'}),
      ).toHaveAttribute('href', '/people');
    });
  });
});
