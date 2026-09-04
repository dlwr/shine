import '@testing-library/jest-dom';
import {render, screen} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import YearsIndexPage, {loader, meta} from './years';
import type {Route} from './+types/years';
import {createMockContext} from '@/lib/test-context';

vi.stubGlobal('fetch', vi.fn());

const mockYears = {
  years: [
    {year: 2001, movieCount: 98, winnerCount: 12},
    {year: 1997, movieCount: 91, winnerCount: 14},
    {year: 1996, movieCount: 88, winnerCount: 13},
    {year: 1953, movieCount: 92, winnerCount: 9},
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

const renderPage = () =>
  render(
    <YearsIndexPage
      loaderData={cast<LoaderData>({...mockYears, locale: 'ja'})}
      actionData={undefined}
      params={cast<ComponentProperties['params']>({})}
      matches={cast<ComponentProperties['matches']>([])}
    />,
  );

describe('Years index page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('loader', () => {
    it('APIから年一覧を取得する', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockYears,
      } as Response);

      const request = new Request('http://localhost:3000/years');
      const result = await loader(
        createLoaderArguments(createMockContext(), request),
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8787/years',
        expect.anything(),
      );
      expect(result.years).toHaveLength(4);
    });

    it('APIが失敗したら502 Responseをthrowする', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({}),
      } as Response);

      const request = new Request('http://localhost:3000/years');
      await expect(
        loader(createLoaderArguments(createMockContext(), request)),
      ).rejects.toMatchObject({status: 502});
    });
  });

  describe('meta', () => {
    it('年の範囲を含むタイトルとdescriptionを組み立てる', () => {
      const result = meta(
        cast<Route.MetaArgs>({
          loaderData: {...mockYears, locale: 'ja'},
        }),
      );

      const title = result.find(
        entry => 'title' in entry && typeof entry.title === 'string',
      ) as {title: string} | undefined;
      expect(title?.title).toBe('製作年から探す映画一覧 | なんか見る');

      const description = result.find(
        entry => 'name' in entry && entry.name === 'description',
      ) as {content: string} | undefined;
      expect(description?.content).toContain('1953年から2001年');
    });
  });

  describe('component', () => {
    it('年代ごとの見出しを新しい順に描画する', () => {
      renderPage();

      const headings = screen
        .getAllByRole('heading', {level: 2})
        .map(heading => heading.textContent)
        .filter(text => /^\d{4}s$/.test(text ?? ''));
      expect(headings).toEqual(['2000s', '1990s', '1950s']);
    });

    it('各年を年別ページへのリンクにする', () => {
      renderPage();

      expect(screen.getByRole('link', {name: /1997/})).toHaveAttribute(
        'href',
        '/years/1997',
      );
    });

    it('年ごとの本数を表示する', () => {
      renderPage();

      expect(screen.getByRole('link', {name: /1997/})).toHaveTextContent('91');
    });
  });
});
