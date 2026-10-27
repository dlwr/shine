import '@testing-library/jest-dom';
import {render, screen} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import DoubleFeaturePage, {loader, meta} from './double-feature';
import type {Route} from './+types/double-feature';
import {createMockContext} from '@/lib/test-context';

vi.stubGlobal('fetch', vi.fn());

const mockFeature = {
  date: '2026-09-15',
  connection: {kind: 'director', label: 'どちらも小津安二郎が監督'},
  movies: [
    {
      uid: 'movie-tokyo',
      title: '東京物語',
      year: 1953,
      posterUrl: 'https://example.com/tokyo.jpg',
    },
    {
      uid: 'movie-banshun',
      title: '晩春',
      year: 1949,
      posterUrl: 'https://example.com/banshun.jpg',
    },
  ],
};

const cast = <T,>(value?: unknown): T => value as T;

const runLoader = async () =>
  loader(
    cast<Route.LoaderArgs>({
      context: createMockContext(),
      request: new Request('http://localhost/double-feature'),
      params: {},
      matches: [],
    }),
  );

const renderPage = (loaderData: Route.ComponentProps['loaderData']) =>
  render(
    <DoubleFeaturePage
      {...cast<Route.ComponentProps>({loaderData, params: {}, matches: []})}
    />,
  );

describe('double-feature', () => {
  beforeEach(() => {
    vi.mocked(fetch).mockReset();
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockFeature,
    } as Response);
  });

  it('つながりの理由を出す', async () => {
    renderPage(await runLoader());

    expect(screen.getByText('どちらも小津安二郎が監督')).toBeInTheDocument();
  });

  it('1本目の映画のページへのリンクを出す', async () => {
    renderPage(await runLoader());

    expect(screen.getByRole('link', {name: /東京物語/})).toHaveAttribute(
      'href',
      '/movies/movie-tokyo',
    );
  });

  it('2本目の映画のページへのリンクを出す', async () => {
    renderPage(await runLoader());

    expect(screen.getByRole('link', {name: /晩春/})).toHaveAttribute(
      'href',
      '/movies/movie-banshun',
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
