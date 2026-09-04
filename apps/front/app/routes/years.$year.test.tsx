import '@testing-library/jest-dom';
import {render, screen} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import YearPage, {loader, meta} from './years.$year';
import type {Route} from './+types/years.$year';
import {createMockContext} from '@/lib/test-context';

vi.stubGlobal('fetch', vi.fn());

const mockYear = {
  year: 1997,
  movies: [
    {
      uid: 'movie-hanabi',
      title: 'HANA-BI',
      posterUrl: 'https://example.com/hanabi.jpg',
      isWinner: true,
      awards: [
        {slug: 'venice-golden-lion', isWinner: true},
        {slug: 'kinema-junpo-japanese', isWinner: false},
      ],
    },
    {
      uid: 'movie-mononoke',
      title: 'もののけ姫',
      posterUrl: undefined,
      isWinner: true,
      awards: [{slug: 'kinema-junpo-japanese', isWinner: true}],
    },
    {
      uid: 'movie-unagi',
      title: 'うなぎ',
      posterUrl: undefined,
      isWinner: false,
      awards: [{slug: 'kinema-junpo-japanese', isWinner: false}],
    },
  ],
  awards: [
    {
      slug: 'venice-golden-lion',
      shortLabel: 'ヴェネツィア',
      name: '金獅子賞',
      organization: 'ヴェネツィア国際映画祭',
    },
    {
      slug: 'kinema-junpo-japanese',
      shortLabel: 'キネ旬日本',
      name: '日本映画ベスト・テン',
      organization: 'キネマ旬報',
    },
  ],
  previousYear: 1996,
  nextYear: undefined,
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
    params: {year: '1997'},
    matches: [],
  });

describe('Year page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('loader', () => {
    it('APIから年別の映画データを取得する', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockYear,
      } as Response);

      const request = new Request('http://localhost:3000/years/1997');
      const result = await loader(
        createLoaderArguments(createMockContext(), request, {year: '1997'}),
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8787/years/1997',
        expect.anything(),
      );
      expect(result.detail.year).toBe(1997);
    });

    it('APIが404を返したら404 Responseをthrowする', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({error: 'Year not found'}),
      } as Response);

      const request = new Request('http://localhost:3000/years/1800');
      await expect(
        loader(
          createLoaderArguments(createMockContext(), request, {year: '1800'}),
        ),
      ).rejects.toMatchObject({status: 404});
    });

    it('数字4桁でないyearはAPIを呼ばず404をthrowする', async () => {
      const mockFetch = vi.mocked(fetch);

      const request = new Request('http://localhost:3000/years/abc');
      await expect(
        loader(
          createLoaderArguments(createMockContext(), request, {year: 'abc'}),
        ),
      ).rejects.toMatchObject({status: 404});
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('meta', () => {
    it('年のタイトルと受賞作入りのdescriptionを組み立てる', () => {
      const result = meta(
        cast<Route.MetaArgs>({
          loaderData: {detail: mockYear, locale: 'ja'},
        }),
      );

      const title = result.find(
        entry => 'title' in entry && typeof entry.title === 'string',
      ) as {title: string} | undefined;
      expect(title?.title).toBe('1997年の映画 | なんか見る');

      const description = result.find(
        entry => 'name' in entry && entry.name === 'description',
      ) as {content: string} | undefined;
      expect(description?.content).toContain('3本');
      expect(description?.content).toContain('『HANA-BI』');
      expect(description?.content).toContain('『もののけ姫』');
    });
  });

  describe('component', () => {
    it('年・本数・作品リストを描画する', () => {
      render(
        <YearPage
          {...createComponentProperties(
            cast<LoaderData>({detail: mockYear, locale: 'ja'}),
          )}
        />,
      );

      expect(screen.getByLabelText('1997')).toBeInTheDocument();
      expect(screen.getByText('3 FILMS')).toBeInTheDocument();
      expect(screen.getByRole('link', {name: /HANA-BI/})).toHaveAttribute(
        'href',
        '/movies/movie-hanabi',
      );
      expect(screen.getByRole('link', {name: /うなぎ/})).toHaveAttribute(
        'href',
        '/movies/movie-unagi',
      );
    });

    it('映画ごとに賞の短縮ラベルを出し、受賞と選出を区別する', () => {
      render(
        <YearPage
          {...createComponentProperties(
            cast<LoaderData>({detail: mockYear, locale: 'ja'}),
          )}
        />,
      );

      expect(
        screen.getByTitle('ヴェネツィア国際映画祭 金獅子賞 受賞'),
      ).toHaveTextContent('ヴェネツィア');
      expect(
        screen.getByTitle('キネマ旬報 日本映画ベスト・テン 受賞'),
      ).toHaveTextContent('キネ旬日本');
      expect(
        screen.getAllByTitle('キネマ旬報 日本映画ベスト・テン 選出'),
      ).toHaveLength(2);
    });

    it('前年へのリンクを表示し、次年がなければ出さない', () => {
      render(
        <YearPage
          {...createComponentProperties(
            cast<LoaderData>({detail: mockYear, locale: 'ja'}),
          )}
        />,
      );

      expect(screen.getByRole('link', {name: '← 1996'})).toHaveAttribute(
        'href',
        '/years/1996',
      );
      expect(screen.queryByText(/1998 →/)).not.toBeInTheDocument();
    });

    it('年一覧へのリンクを置く', () => {
      render(
        <YearPage
          {...createComponentProperties(
            cast<LoaderData>({detail: mockYear, locale: 'ja'}),
          )}
        />,
      );

      expect(screen.getByRole('link', {name: 'ALL YEARS'})).toHaveAttribute(
        'href',
        '/years',
      );
    });
  });
});
