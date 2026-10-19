import '@testing-library/jest-dom';
import {render, screen} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import AwardUnavailablePage, {loader, meta} from './awards.$slug.unavailable';
import type {Route} from './+types/awards.$slug.unavailable';
import {createMockContext} from '@/lib/test-context';

vi.stubGlobal('fetch', vi.fn());

const mockList = {
  slug: 'palme-dor',
  name: 'パルム・ドール',
  organization: 'カンヌ国際映画祭',
  description:
    'カンヌ国際映画祭の最高賞パルム・ドールの歴代受賞作と公式出品作の一覧。',
  grouping: 'year' as const,
  availabilitySummary: {
    total: 40,
    watchable: 30,
    rentalOnly: 3,
    unwatchable: 2,
    unchecked: 5,
  },
  movies: [
    {
      uid: 'movie-new',
      title: '新しい観られない映画',
      movieYear: 2023,
      posterUrl: 'https://example.com/new.jpg',
      isWinner: false,
      ceremonyYears: [2023],
    },
    {
      uid: 'movie-old',
      title: '古い観られない映画',
      movieYear: 1980,
      isWinner: true,
      ceremonyYears: [1981, 1980],
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

const createMetaArguments = (list: unknown) =>
  cast<Route.MetaArgs>({
    loaderData: {list, locale: 'ja'},
    params: {slug: 'palme-dor'},
    location: {
      pathname: '/awards/palme-dor/unavailable',
      search: '',
      hash: '',
      state: undefined,
      key: 'test',
    },
    matches: [],
  });

const renderPage = (list: unknown) =>
  render(
    <AwardUnavailablePage
      {...createComponentProperties(cast<LoaderData>({list, locale: 'ja'}))}
    />,
  );

describe('Award unavailable page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('loader', () => {
    it('API から観られない作品の一覧を取得する', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockList,
      } as Response);

      const request = new Request(
        'http://localhost:3000/awards/palme-dor/unavailable',
      );
      const result = await loader(
        createLoaderArguments(createMockContext(), request, {
          slug: 'palme-dor',
        }),
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8787/awards/palme-dor/unavailable',
        {signal: request.signal},
      );
      expect(result).toEqual({list: mockList, locale: 'ja'});
    });

    it('API が 404 を返したら 404 Response を throw する', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({error: 'Award not found'}),
      } as Response);

      await expect(
        loader(
          createLoaderArguments(
            createMockContext(),
            new Request('http://localhost:3000/awards/unknown/unavailable'),
            {slug: 'unknown'},
          ),
        ),
      ).rejects.toMatchObject({status: 404});
    });
  });

  describe('meta', () => {
    it('題名に観られない本数を入れる', () => {
      const descriptors = meta(createMetaArguments(mockList));
      const title = descriptors.find(descriptor => 'title' in descriptor) as {
        title: string;
      };

      expect(title.title).toBe(
        'カンヌ国際映画祭 パルム・ドール 日本で観られない2本 | SHINE',
      );
    });

    it('description に全体の本数と観られない本数を入れる', () => {
      const descriptors = meta(createMetaArguments(mockList));
      const description = descriptors.find(
        descriptor => 'name' in descriptor && descriptor.name === 'description',
      ) as {content: string};

      expect(description.content).toBe(
        'カンヌ国際映画祭 パルム・ドールの受賞作・ノミネート作40本のうち、配信にも宅配レンタルにも無く日本で観られない2本の一覧。授賞式の年の新しい順。',
      );
    });

    it('観られない作品が無ければ noindex にする', () => {
      const descriptors = meta(
        createMetaArguments({
          ...mockList,
          movies: [],
          availabilitySummary: {
            ...mockList.availabilitySummary,
            unwatchable: 0,
          },
        }),
      );

      expect(descriptors).toContainEqual({
        name: 'robots',
        content: 'noindex, follow',
      });
    });

    it('観られない作品があれば noindex にしない', () => {
      const descriptors = meta(createMetaArguments(mockList));

      expect(descriptors).not.toContainEqual(
        expect.objectContaining({name: 'robots'}),
      );
    });
  });

  describe('component', () => {
    it('見出しに観られない本数を出す', () => {
      renderPage(mockList);

      expect(
        screen.getByRole('heading', {level: 1, name: '日本で観られない 2 本'}),
      ).toBeInTheDocument();
    });

    it('作品を映画ページへのリンクで並べる', () => {
      renderPage(mockList);

      const links = screen.getAllByRole('link', {name: /観られない映画/});
      expect(links.map(link => link.getAttribute('href'))).toEqual([
        '/movies/movie-new',
        '/movies/movie-old',
      ]);
    });

    it('授賞式の年を出す', () => {
      renderPage(mockList);

      expect(screen.getByText('1981 / 1980・1980年')).toBeInTheDocument();
    });

    it('受賞作に受賞の印を付ける', () => {
      renderPage(mockList);

      expect(screen.getAllByText('受賞')).toHaveLength(1);
    });

    it('賞ページへ戻るリンクを置く', () => {
      renderPage(mockList);

      expect(
        screen.getByRole('link', {name: 'カンヌ国際映画祭 パルム・ドール'}),
      ).toHaveAttribute('href', '/awards/palme-dor');
    });

    it('観られない作品が無ければその旨を出す', () => {
      renderPage({...mockList, movies: []});

      expect(
        screen.getByText('観られない作品はありません'),
      ).toBeInTheDocument();
    });
  });
});
