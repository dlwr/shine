import '@testing-library/jest-dom';
import {render, screen} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import ShiritoriPage, {loader} from './shiritori';
import type {Route} from './+types/shiritori';
import {createMockContext} from '@/lib/test-context';

vi.stubGlobal('fetch', vi.fn());

const chain = {
  date: '2026-09-15',
  links: [
    {
      uid: 'movie-totoro',
      title: 'となりのトトロ',
      year: 1988,
      first: 'と',
      last: 'ろ',
      watchable: true,
    },
    {
      uid: 'movie-roma',
      title: 'ローマ',
      year: 2018,
      first: 'ろ',
      last: 'ま',
      watchable: false,
    },
    {
      uid: 'movie-mermaid',
      title: 'マーメイドラグーン',
      year: 2000,
      first: 'ま',
      last: 'ん',
      watchable: false,
    },
  ],
};

const cast = <T,>(value?: unknown): T => value as T;

const runLoader = async (search = '') =>
  loader(
    cast<Route.LoaderArgs>({
      context: createMockContext(),
      request: new Request(`http://localhost/shiritori${search}`),
      params: {},
      matches: [],
    }),
  );

const renderPage = (loaderData: Route.ComponentProps['loaderData']) =>
  render(
    <ShiritoriPage
      {...cast<Route.ComponentProps>({loaderData, params: {}, matches: []})}
    />,
  );

describe('shiritori', () => {
  beforeEach(() => {
    vi.mocked(fetch).mockReset();
    vi.mocked(fetch).mockImplementation(async input => {
      const url = new URL(String(input));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ...chain,
          from: url.searchParams.get('from') ?? undefined,
        }),
      } as Response;
    });
  });

  it('鎖の映画を映画ページへリンクする', async () => {
    renderPage(await runLoader());

    expect(
      screen.getByRole('link', {name: /^『ローマ』\s*2018年$/}),
    ).toHaveAttribute('href', '/movies/movie-roma');
  });

  it('2 本目以降からしりとりを続けられる', async () => {
    renderPage(await runLoader());

    expect(
      screen.getByRole('link', {name: '『ローマ』から続ける'}),
    ).toHaveAttribute('href', '/shiritori?from=movie-roma');
  });

  it('ん で終わったことを示す', async () => {
    renderPage(await runLoader());

    expect(screen.getByText('「ん」で終わり')).toBeInTheDocument();
  });

  it('from を API へ渡す', async () => {
    await runLoader('?from=movie-roma');

    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain(
      '/shiritori?from=movie-roma',
    );
  });

  it('from から始めたときは今日のしりとりへ戻れる', async () => {
    renderPage(await runLoader('?from=movie-roma'));

    expect(
      screen.getByRole('link', {name: '今日のしりとりへ戻る'}),
    ).toHaveAttribute('href', '/shiritori');
  });
});
