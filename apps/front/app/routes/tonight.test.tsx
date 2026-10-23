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
  maxRuntime: 90,
};

const cast = <T,>(value?: unknown): T => value as T;

const runLoader = async (url = 'http://localhost/tonight') =>
  loader(
    cast<Route.LoaderArgs>({
      context: createMockContext(),
      request: new Request(url),
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

  it('?m= の分数で引く', async () => {
    await runLoader('http://localhost/tonight?m=60');

    expect(vi.mocked(fetch).mock.calls[0][0]).toMatch(/\/tonight\?max=60$/);
  });

  it('選べない分数は 404 にする', async () => {
    await expect(
      runLoader('http://localhost/tonight?m=45'),
    ).rejects.toMatchObject({status: 404});
  });

  it('ほかの分数へのリンクを出す', async () => {
    renderPage(await runLoader());

    expect(screen.getByRole('link', {name: '60分'})).toHaveAttribute(
      'href',
      '/tonight?m=60',
    );
  });

  it('別の1本は同じ分数で引き直す', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({...mockPick, maxRuntime: 120}),
    } as Response);
    renderPage(await runLoader('http://localhost/tonight?m=120'));

    expect(screen.getByRole('link', {name: '別の1本を引く'})).toHaveAttribute(
      'href',
      '/tonight?m=120',
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
