import '@testing-library/jest-dom';
import {render, screen} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import AwardYearPage, {loader, meta} from './awards.$slug.$year';
import type {Route} from './+types/awards.$slug.$year';
import {createMockContext} from '@/lib/test-context';

vi.stubGlobal('fetch', vi.fn());

const mockAwardYear = {
  slug: 'palme-dor',
  name: 'パルム・ドール',
  organization: 'カンヌ国際映画祭',
  description:
    'カンヌ国際映画祭の最高賞パルム・ドールの歴代受賞作と公式出品作の一覧。',
  year: 2023,
  ceremonyNumber: 76,
  movies: [
    {
      uid: 'movie-winner',
      title: '落下の解剖学',
      movieYear: 2023,
      posterUrl: 'https://example.com/poster.jpg',
      isWinner: true,
    },
    {
      uid: 'movie-nominee',
      title: '怪物',
      movieYear: 2023,
      posterUrl: undefined,
      isWinner: false,
    },
  ],
  previousYear: 2022,
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
    params: {slug: 'palme-dor', year: '2023'},
    matches: [],
  });

describe('Award year page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('loader', () => {
    it('APIから年別の賞データを取得する', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockAwardYear,
      } as Response);

      const request = new Request(
        'http://localhost:3000/awards/palme-dor/2023',
      );
      const result = await loader(
        createLoaderArguments(createMockContext(), request, {
          slug: 'palme-dor',
          year: '2023',
        }),
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8787/awards/palme-dor/2023',
        expect.anything(),
      );
      expect(result.award.year).toBe(2023);
    });

    it('APIが404を返したら404 Responseをthrowする', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({error: 'Award not found'}),
      } as Response);

      const request = new Request(
        'http://localhost:3000/awards/palme-dor/1800',
      );
      await expect(
        loader(
          createLoaderArguments(createMockContext(), request, {
            slug: 'palme-dor',
            year: '1800',
          }),
        ),
      ).rejects.toMatchObject({status: 404});
    });

    it('数字4桁でないyearはAPIを呼ばず404をthrowする', async () => {
      const mockFetch = vi.mocked(fetch);

      const request = new Request('http://localhost:3000/awards/palme-dor/abc');
      await expect(
        loader(
          createLoaderArguments(createMockContext(), request, {
            slug: 'palme-dor',
            year: 'abc',
          }),
        ),
      ).rejects.toMatchObject({status: 404});
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('meta', () => {
    it('回数付きのタイトルと受賞作入りのdescriptionを組み立てる', () => {
      const result = meta(
        cast<Route.MetaArgs>({
          loaderData: {award: mockAwardYear, locale: 'ja'},
        }),
      );

      const title = result.find(
        entry => 'title' in entry && typeof entry.title === 'string',
      ) as {title: string} | undefined;
      expect(title?.title).toBe(
        'カンヌ国際映画祭 パルム・ドール 2023年（第76回） | SHINE',
      );

      const description = result.find(
        entry => 'name' in entry && entry.name === 'description',
      ) as {content: string} | undefined;
      expect(description?.content).toContain('落下の解剖学');
    });
  });

  describe('component', () => {
    it('年・回数・作品リストを描画する', () => {
      render(
        <AwardYearPage
          {...createComponentProperties(
            cast<LoaderData>({award: mockAwardYear, locale: 'ja'}),
          )}
        />,
      );

      expect(screen.getByText('2023')).toBeInTheDocument();
      expect(screen.getByText('第76回')).toBeInTheDocument();
      expect(screen.getByText('落下の解剖学')).toBeInTheDocument();
      expect(screen.getByText('怪物')).toBeInTheDocument();
      expect(screen.getByText('WINNER')).toBeInTheDocument();
    });

    it('順位を持つ賞は順位を表示する', () => {
      const award = {
        ...mockAwardYear,
        movies: [
          {...mockAwardYear.movies[0], specialMention: '1位'},
          {...mockAwardYear.movies[1], specialMention: '2位'},
        ],
      };

      render(
        <AwardYearPage
          {...createComponentProperties(
            cast<LoaderData>({award, locale: 'ja'}),
          )}
        />,
      );

      expect(screen.getByText('1位')).toBeInTheDocument();
      expect(screen.getByText('2位')).toBeInTheDocument();
    });

    it('順位を持つ賞はWINNERバッジを出さない', () => {
      const award = {
        ...mockAwardYear,
        movies: [{...mockAwardYear.movies[0], specialMention: '1位'}],
      };

      render(
        <AwardYearPage
          {...createComponentProperties(
            cast<LoaderData>({award, locale: 'ja'}),
          )}
        />,
      );

      expect(screen.queryByText('WINNER')).not.toBeInTheDocument();
    });

    it('前年へのリンクを表示し、次年がなければ出さない', () => {
      render(
        <AwardYearPage
          {...createComponentProperties(
            cast<LoaderData>({award: mockAwardYear, locale: 'ja'}),
          )}
        />,
      );

      expect(screen.getByRole('link', {name: '← 2022'})).toHaveAttribute(
        'href',
        '/awards/palme-dor/2022',
      );
      expect(screen.queryByText(/2024 →/)).not.toBeInTheDocument();
    });
  });
});
