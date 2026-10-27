import '@testing-library/jest-dom';
import {render, screen} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import ConnectPage, {loader, meta} from './connect';
import type {Route} from './+types/connect';
import {createMockContext} from '@/lib/test-context';

vi.stubGlobal('fetch', vi.fn());

const tokyo = {uid: 'movie-tokyo', title: '東京物語', year: 1953};
const banshun = {uid: 'movie-banshun', title: '晩春', year: 1949};
const sanma = {uid: 'movie-sanma', title: '秋刀魚の味', year: 1962};

const connection = {
  from: tokyo,
  to: sanma,
  links: [
    {
      person: {uid: 'person-hara', name: '原節子'},
      role: 'cast',
      movie: banshun,
    },
    {
      person: {uid: 'person-ozu', name: '小津安二郎'},
      role: 'director',
      movie: sanma,
    },
  ],
};

const responses: Record<string, unknown> = {
  '/connect/pick': {date: '2026-09-15', from: 'movie-tokyo', to: 'movie-sanma'},
  '/connect': connection,
  '/movies/search': {
    movies: [
      {...banshun, posterUrls: [], hasNominations: true},
      {...sanma, posterUrls: [], hasNominations: false},
    ],
  },
};

const cast = <T,>(value?: unknown): T => value as T;

const runLoader = async (search = '') =>
  loader(
    cast<Route.LoaderArgs>({
      context: createMockContext(),
      request: new Request(`http://localhost/connect${search}`),
      params: {},
      matches: [],
    }),
  );

const renderPage = (loaderData: Route.ComponentProps['loaderData']) =>
  render(
    <ConnectPage
      {...cast<Route.ComponentProps>({loaderData, params: {}, matches: []})}
    />,
  );

describe('connect', () => {
  beforeEach(() => {
    vi.mocked(fetch).mockReset();
    vi.mocked(fetch).mockImplementation(async input => {
      const {pathname} = new URL(String(input));
      return {
        ok: true,
        status: 200,
        json: async () => responses[pathname],
      } as Response;
    });
  });

  it('おまかせの 2 本へのリンクを出す', async () => {
    renderPage(await runLoader());

    expect(screen.getByRole('link', {name: 'おまかせ'})).toHaveAttribute(
      'href',
      '/connect?from=movie-tokyo&to=movie-sanma',
    );
  });

  it('何手でつながるかを出す', async () => {
    renderPage(await runLoader('?from=movie-tokyo&to=movie-sanma'));

    expect(screen.getByText('2手でつながる')).toBeInTheDocument();
  });

  it('つなぐ人物と役割を出す', async () => {
    renderPage(await runLoader('?from=movie-tokyo&to=movie-sanma'));

    expect(screen.getByText('原節子')).toHaveAttribute(
      'href',
      '/people/person-hara',
    );
  });

  it('経路の途中の映画のページへのリンクを出す', async () => {
    renderPage(await runLoader('?from=movie-tokyo&to=movie-sanma'));

    expect(screen.getByRole('link', {name: /晩春/})).toHaveAttribute(
      'href',
      '/movies/movie-banshun',
    );
  });

  it('つながらなければ 3 手ではつながらないと出す', async () => {
    responses['/connect'] = {...connection, links: undefined};
    renderPage(await runLoader('?from=movie-tokyo&to=movie-sanma'));
    responses['/connect'] = connection;

    expect(screen.getByText('3手ではつながらない')).toBeInTheDocument();
  });

  it('検索した候補を選ぶと、もう一方の選択を残したリンクになる', async () => {
    renderPage(await runLoader('?to=movie-sanma&fq=晩春'));

    expect(screen.getByRole('link', {name: /晩春/})).toHaveAttribute(
      'href',
      `/connect?from=movie-banshun&to=movie-sanma&fq=${encodeURIComponent('晩春')}`,
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
