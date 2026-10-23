import '@testing-library/jest-dom';
import {render, screen} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import LanguagePage, {loader, meta} from './languages.$code';
import type {Route} from './+types/languages.$code';
import {createMockContext} from '@/lib/test-context';

vi.stubGlobal('fetch', vi.fn());

const mockPage = {
  code: 'fa',
  movieCount: 101,
  page: 1,
  pageCount: 2,
  movies: [
    {
      uid: 'movie-separation',
      title: '別離',
      posterUrl: 'https://example.com/separation.jpg',
      year: 2011,
      isWinner: true,
      awards: [{slug: 'berlin-golden-bear', isWinner: true}],
    },
  ],
  awards: [
    {
      slug: 'berlin-golden-bear',
      shortLabel: 'ベルリン',
      name: '金熊賞',
      organization: 'ベルリン国際映画祭',
    },
  ],
};

const cast = <T,>(value?: unknown): T => value as T;

type LoaderData = Route.ComponentProps['loaderData'];

const runLoader = async (url: string) =>
  loader(
    cast<Route.LoaderArgs>({
      context: createMockContext(),
      request: new Request(url),
      params: {code: 'fa'},
      matches: [],
    }),
  );

const renderPage = (loaderData: LoaderData) =>
  render(
    <LanguagePage
      {...cast<Route.ComponentProps>({
        loaderData,
        params: {code: 'fa'},
        matches: [],
      })}
    />,
  );

const respondWith = (body: unknown, status = 200) => {
  vi.mocked(fetch).mockResolvedValue({
    ok: status === 200,
    status,
    json: async () => body,
  } as Response);
};

describe('languages/:code', () => {
  beforeEach(() => {
    vi.mocked(fetch).mockReset();
    respondWith(mockPage);
  });

  it('?page= のページを引く', async () => {
    await runLoader('http://localhost/languages/fa?page=2');

    expect(vi.mocked(fetch).mock.calls[0][0]).toMatch(
      /\/languages\/fa\?page=2$/,
    );
  });

  it('無い言語は 404 にする', async () => {
    respondWith({error: 'Language not found'}, 404);

    await expect(
      runLoader('http://localhost/languages/zz'),
    ).rejects.toMatchObject({status: 404});
  });

  it('noindex にする', async () => {
    const loaderData = await runLoader('http://localhost/languages/fa');
    const descriptors = meta(cast<Route.MetaArgs>({loaderData}));

    expect(descriptors).toContainEqual({
      name: 'robots',
      content: 'noindex, follow',
    });
  });

  it('見出しに言語名を出す', async () => {
    renderPage(await runLoader('http://localhost/languages/fa'));

    expect(
      screen.getByRole('heading', {level: 1, name: 'ペルシア語の映画'}),
    ).toBeInTheDocument();
  });

  it('次のページへのリンクを出す', async () => {
    renderPage(await runLoader('http://localhost/languages/fa'));

    expect(screen.getByRole('link', {name: '次 →'})).toHaveAttribute(
      'href',
      '/languages/fa?page=2',
    );
  });

  it('最後のページには次のページへのリンクを出さない', async () => {
    respondWith({...mockPage, page: 2});
    renderPage(await runLoader('http://localhost/languages/fa?page=2'));

    expect(screen.queryByRole('link', {name: '次 →'})).not.toBeInTheDocument();
  });
});
