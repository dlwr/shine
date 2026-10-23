import '@testing-library/jest-dom';
import {render, screen} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import TonightPage, {loader, meta} from './tonight';
import type {Route} from './+types/tonight';
import {createMockContext} from '@/lib/test-context';

vi.stubGlobal('fetch', vi.fn());

const mockPick = {
  movie: {
    uid: 'movie-cleo',
    title: '5時から7時までのクレオ',
    posterUrl: 'https://example.com/cleo.jpg',
    year: 1962,
    runtime: 90,
    isWinner: false,
    awards: [{slug: 'palme-dor', isWinner: false}],
  },
  awards: [
    {
      slug: 'palme-dor',
      shortLabel: 'カンヌ',
      name: 'パルム・ドール',
      organization: 'カンヌ国際映画祭',
    },
  ],
  poolSize: 1508,
};

const cast = <T,>(value?: unknown): T => value as T;

const runLoader = async () =>
  loader(
    cast<Route.LoaderArgs>({
      context: createMockContext(),
      request: new Request('http://localhost/tonight'),
      params: {},
      matches: [],
    }),
  );

const renderPage = (loaderData: Route.ComponentProps['loaderData']) =>
  render(
    <TonightPage
      {...cast<Route.ComponentProps>({loaderData, params: {}, matches: []})}
    />,
  );

describe('tonight', () => {
  beforeEach(() => {
    vi.mocked(fetch).mockReset();
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockPick,
    } as Response);
  });

  it('選ばれた映画のページへのリンクを出す', async () => {
    renderPage(await runLoader());

    expect(
      screen.getByRole('link', {name: /5時から7時までのクレオ/}),
    ).toHaveAttribute('href', '/movies/movie-cleo');
  });

  it('上映時間を出す', async () => {
    renderPage(await runLoader());

    expect(screen.getByText('1962年・90分')).toBeInTheDocument();
  });

  it('別の1本を引くリンクを出す', async () => {
    renderPage(await runLoader());

    expect(screen.getByRole('link', {name: '別の1本を引く'})).toHaveAttribute(
      'href',
      '/tonight',
    );
  });

  it('noindex にする', async () => {
    const loaderData = await runLoader();
    const descriptors = meta(cast<Route.MetaArgs>({loaderData}));

    expect(descriptors).toContainEqual({
      name: 'robots',
      content: 'noindex, follow',
    });
  });
});
