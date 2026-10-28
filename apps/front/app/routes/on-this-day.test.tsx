import '@testing-library/jest-dom';
import {render, screen} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import OnThisDayPage, {loader, meta} from './on-this-day';
import type {Route} from './+types/on-this-day';
import {createMockContext} from '@/lib/test-context';

vi.stubGlobal('fetch', vi.fn());

const mockDay = {
  monthDay: '09-15',
  movies: [
    {
      uid: 'movie-hiroshima',
      title: '二十四の瞳',
      posterUrl: 'https://example.com/hitomi.jpg',
      releaseDate: '1954-09-15',
      isWinner: true,
      awards: [{slug: 'kinema-junpo-japanese', isWinner: true}],
    },
    {
      uid: 'movie-beauty',
      title: 'アメリカン・ビューティー',
      posterUrl: undefined,
      releaseDate: '1999-09-15',
      isWinner: false,
      awards: [{slug: 'kinema-junpo-japanese', isWinner: false}],
    },
  ],
  awards: [
    {
      slug: 'kinema-junpo-japanese',
      shortLabel: 'キネ旬日本',
      name: '日本映画ベスト・テン',
      organization: 'キネマ旬報',
    },
  ],
  people: [{uid: 'person-mendes', name: 'サム・メンデス', birthYear: 1965}],
};

const cast = <T,>(value?: unknown): T => value as T;

type LoaderData = Route.ComponentProps['loaderData'];

const runLoader = async (url: string) =>
  loader(
    cast<Route.LoaderArgs>({
      context: createMockContext(),
      request: new Request(url),
      params: {},
      matches: [],
    }),
  );

const renderPage = (loaderData: LoaderData) =>
  render(
    <OnThisDayPage
      {...cast<Route.ComponentProps>({loaderData, params: {}, matches: []})}
    />,
  );

const respondWith = (body: unknown) => {
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
  } as Response);
};

describe('on-this-day', () => {
  beforeEach(() => {
    vi.useFakeTimers({toFake: ['Date']});
    vi.setSystemTime(new Date('2026-09-15T03:00:00+09:00'));
    vi.mocked(fetch).mockReset();
    respondWith(mockDay);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('指定が無ければ日本時間の今日の月日を引く', async () => {
    await runLoader('http://localhost/on-this-day');

    expect(vi.mocked(fetch).mock.calls[0][0]).toMatch(/\/on-this-day\/09-15$/);
  });

  it('?d= の月日を引く', async () => {
    await runLoader('http://localhost/on-this-day?d=02-29');

    expect(vi.mocked(fetch).mock.calls[0][0]).toMatch(/\/on-this-day\/02-29$/);
  });

  it('不正な月日は 404 にする', async () => {
    await expect(
      runLoader('http://localhost/on-this-day?d=02-30'),
    ).rejects.toMatchObject({status: 404});
  });

  it('noindex にする', async () => {
    const loaderData = await runLoader('http://localhost/on-this-day');
    const descriptors = meta(cast<Route.MetaArgs>({loaderData}));

    expect(descriptors).toContainEqual({
      name: 'robots',
      content: 'noindex, follow',
    });
  });

  it('見出しに月日を出す', async () => {
    renderPage(await runLoader('http://localhost/on-this-day'));

    expect(
      screen.getByRole('heading', {level: 1, name: /9月15日/}),
    ).toBeInTheDocument();
  });

  it('公開からの年数を出す', async () => {
    renderPage(await runLoader('http://localhost/on-this-day'));

    expect(screen.getByText('1954年・公開から72年')).toBeInTheDocument();
  });

  it('前日と翌日へのリンクを出す', async () => {
    renderPage(await runLoader('http://localhost/on-this-day'));

    expect(screen.getByRole('link', {name: /9月14日/})).toHaveAttribute(
      'href',
      '/on-this-day?d=09-14',
    );
  });

  it('該当が無い日はその旨を出す', async () => {
    respondWith({...mockDay, movies: [], awards: []});
    renderPage(await runLoader('http://localhost/on-this-day?d=02-29'));

    expect(
      screen.getByText(/この日に初公開された映画はまだありません/),
    ).toBeInTheDocument();
  });

  it('この日が誕生日の映画人を人物ページへのリンクで出す', async () => {
    renderPage(await runLoader('http://localhost/on-this-day'));

    expect(screen.getByRole('link', {name: /サム・メンデス/})).toHaveAttribute(
      'href',
      '/people/person-mendes',
    );
  });

  it('映画人の生まれ年を出す', async () => {
    renderPage(await runLoader('http://localhost/on-this-day'));

    expect(screen.getByText('1965年生まれ')).toBeInTheDocument();
  });

  it('誕生日の映画人がいなければ欄を出さない', async () => {
    respondWith({...mockDay, people: []});
    renderPage(await runLoader('http://localhost/on-this-day'));

    expect(
      screen.queryByRole('heading', {name: /誕生日/}),
    ).not.toBeInTheDocument();
  });
});
