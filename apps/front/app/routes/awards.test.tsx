import '@testing-library/jest-dom';
import {render, screen} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import AwardsIndexPage, {loader, meta} from './awards';
import type {Route} from './+types/awards';
import {createMockContext} from '@/lib/test-context';

globalThis.fetch = vi.fn();

const mockAwards = {
  awards: [
    {
      slug: 'palme-dor',
      name: 'パルム・ドール',
      organization: 'カンヌ国際映画祭',
      description: 'カンヌ国際映画祭の最高賞パルム・ドールの一覧。',
      grouping: 'year' as const,
      movieCount: 1772,
      firstYear: 1946,
      lastYear: 2025,
    },
    {
      slug: 'academy-best-picture',
      name: '作品賞',
      organization: 'アカデミー賞',
      description: 'アカデミー賞作品賞の一覧。',
      grouping: 'year' as const,
      movieCount: 621,
      firstYear: 1929,
      lastYear: 2025,
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

describe('Awards crossings link', () => {
  it('賞の交差ページへの導線を置く', () => {
    render(
      <AwardsIndexPage
        loaderData={cast<LoaderData>({...mockAwards, locale: 'ja'})}
        actionData={undefined}
        params={cast<ComponentProperties['params']>({})}
        matches={cast<ComponentProperties['matches']>([])}
      />,
    );

    expect(screen.getByRole('link', {name: /賞の交差/})).toHaveAttribute(
      'href',
      '/crossings',
    );
  });

  it('無冠の映画ページへの導線を置く', () => {
    render(
      <AwardsIndexPage
        loaderData={cast<LoaderData>({...mockAwards, locale: 'ja'})}
        actionData={undefined}
        params={cast<ComponentProperties['params']>({})}
        matches={cast<ComponentProperties['matches']>([])}
      />,
    );

    expect(screen.getByRole('link', {name: /無冠の映画/})).toHaveAttribute(
      'href',
      '/uncrowned',
    );
  });
});

describe('Awards index page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('loader', () => {
    it('APIから賞の一覧を取得する', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockAwards,
      } as Response);

      const request = new Request('http://localhost:3000/awards');
      const result = await loader(
        createLoaderArguments(createMockContext(), request),
      );

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:8787/awards', {
        signal: request.signal,
      });
      expect(result).toEqual({awards: mockAwards.awards, locale: 'ja'});
    });
  });

  describe('meta', () => {
    it('賞一覧のタイトルを返す', () => {
      const metaArguments = cast<Route.MetaArgs>({
        loaderData: {awards: mockAwards.awards, locale: 'ja'},
        params: {},
        location: {
          pathname: '/awards',
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

      expect(titleDescriptor.title).toBe('映画賞・リスト一覧 | SHINE');
    });
  });

  describe('component', () => {
    it('各賞のページへリンクする', () => {
      render(
        <AwardsIndexPage
          {...cast<ComponentProperties>({
            loaderData: cast<LoaderData>({
              awards: mockAwards.awards,
              locale: 'ja',
            }),
            params: {},
            matches: [],
          })}
        />,
      );

      const palmeLink = screen.getByRole('link', {name: /パルム・ドール/});
      expect(palmeLink).toHaveAttribute('href', '/awards/palme-dor');
      const academyLink = screen.getByRole('link', {name: /作品賞/});
      expect(academyLink).toHaveAttribute(
        'href',
        '/awards/academy-best-picture',
      );
    });
  });
});
