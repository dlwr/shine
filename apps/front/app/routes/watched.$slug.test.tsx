import '@testing-library/jest-dom';
import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import WatchedListPage, {loader, meta} from './watched.$slug';
import type {Route} from './+types/watched.$slug';
import {createMockContext} from '@/lib/test-context';
import {encodeWatched, WATCHED_STORAGE_KEY} from '@/lib/watched';

vi.stubGlobal('fetch', vi.fn());

const cast = <T,>(value?: unknown): T => value as T;

const AWARD = {
  slug: 'palme-dor',
  name: 'パルム・ドール',
  organization: 'カンヌ国際映画祭',
  description: 'カンヌ国際映画祭の最高賞。',
  grouping: 'year',
  years: [
    {
      year: 2023,
      ceremonyNumber: 76,
      filmCount: 21,
      movies: [
        {
          uid: 'uid-2023',
          title: '落下の解剖学',
          movieYear: 2023,
          posterUrl: 'https://image.tmdb.org/t/p/original/a.jpg',
          isWinner: true,
        },
      ],
    },
    {
      year: 2022,
      ceremonyNumber: 75,
      filmCount: 21,
      movies: [
        {uid: 'uid-2022', title: '逆転のトライアングル', isWinner: true},
      ],
    },
    {
      year: 2021,
      ceremonyNumber: 74,
      filmCount: 24,
      movies: [{uid: 'uid-2021', title: 'チタン', isWinner: true}],
    },
  ],
};

const FILMS = [
  {uid: 'uid-2021', title: 'チタン', year: 2021},
  {uid: 'uid-2022', title: '逆転のトライアングル', year: 2022},
  {
    uid: 'uid-2023',
    title: '落下の解剖学',
    year: 2023,
    movieYear: 2023,
    posterUrl: 'https://image.tmdb.org/t/p/original/a.jpg',
  },
];
const ORDER = FILMS.map(film => film.uid);

const mockResponse = (body: unknown, status = 200) => {
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
};

const createLoaderArguments = (
  url = 'http://localhost:3000/watched/palme-dor',
) =>
  cast<Route.LoaderArgs>({
    context: createMockContext(),
    request: new Request(url),
    params: {slug: 'palme-dor'},
    matches: [],
  });

const createComponentProperties = (shared?: string): Route.ComponentProps =>
  cast<Route.ComponentProps>({
    loaderData: {
      slug: 'palme-dor',
      heading: 'カンヌ国際映画祭 パルム・ドール',
      films: FILMS,
      shared,
      locale: 'ja',
    },
    params: {slug: 'palme-dor'},
    matches: [],
  });

function storedUids(): string[] {
  return (
    (
      JSON.parse(localStorage.getItem(WATCHED_STORAGE_KEY) ?? '{}') as {
        uids?: string[];
      }
    ).uids ?? []
  );
}

describe('Watched list page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
  });

  describe('loader', () => {
    it('受賞作を授賞式年の昇順に並べて返す', async () => {
      mockResponse(AWARD);

      const result = await loader(createLoaderArguments());

      expect(result.heading).toBe('カンヌ国際映画祭 パルム・ドール');
      expect(result.films.map(film => film.uid)).toEqual(ORDER);
      expect(result.shared).toBeUndefined();
    });

    it('共有された符号を返す', async () => {
      mockResponse(AWARD);

      const result = await loader(
        createLoaderArguments('http://localhost:3000/watched/palme-dor?s=1.oA'),
      );

      expect(result.shared).toBe('1.oA');
    });

    it('符号の形式でない s は無視する', async () => {
      mockResponse(AWARD);

      const result = await loader(
        createLoaderArguments(
          'http://localhost:3000/watched/palme-dor?s=<script>',
        ),
      );

      expect(result.shared).toBeUndefined();
    });

    it('年度制でない賞は404にする', async () => {
      mockResponse({...AWARD, grouping: 'list'});

      await expect(loader(createLoaderArguments())).rejects.toMatchObject({
        status: 404,
      });
    });

    it('映画祭のサブ賞は404にする', async () => {
      mockResponse({...AWARD, slug: 'cannes-grand-prix', subAward: true});

      await expect(loader(createLoaderArguments())).rejects.toMatchObject({
        status: 404,
      });
    });

    it('APIが404を返したら404にする', async () => {
      mockResponse({error: 'Award not found'}, 404);

      await expect(loader(createLoaderArguments())).rejects.toMatchObject({
        status: 404,
      });
    });

    it('APIが失敗したら502にする', async () => {
      mockResponse({}, 500);

      await expect(loader(createLoaderArguments())).rejects.toMatchObject({
        status: 502,
      });
    });
  });

  describe('meta', () => {
    it('何本観たかを問うタイトルと賞ごとのOG画像を出す', () => {
      const descriptors = meta(
        cast<Route.MetaArgs>({
          loaderData: createComponentProperties().loaderData,
        }),
      ) as Array<Record<string, string>>;

      expect(descriptors).toContainEqual({
        title: 'カンヌ国際映画祭 パルム・ドール受賞作、何本観た？ | SHINE',
      });
      expect(descriptors).toContainEqual({
        property: 'og:image',
        content: 'https://shine-film.com/og/watched.png?slug=palme-dor',
      });
      expect(descriptors).toContainEqual({
        property: 'og:url',
        content: 'https://shine-film.com/watched/palme-dor',
      });
    });

    it('共有URLでは成績をタイトルに出し、符号付きのOG画像を指す', () => {
      const shared = encodeWatched(ORDER, new Set(['uid-2021', 'uid-2023']));
      const descriptors = meta(
        cast<Route.MetaArgs>({
          loaderData: createComponentProperties(shared).loaderData,
        }),
      ) as Array<Record<string, string>>;

      expect(descriptors).toContainEqual({
        title:
          'カンヌ国際映画祭 パルム・ドールの受賞作、3本中2本観てた | SHINE',
      });
      expect(descriptors).toContainEqual({
        property: 'og:image',
        content: `https://shine-film.com/og/watched.png?slug=palme-dor&s=${shared}`,
      });
      expect(descriptors).toContainEqual({
        property: 'og:url',
        content: `https://shine-film.com/watched/palme-dor?s=${shared}`,
      });
    });
  });

  describe('component', () => {
    it('受賞作を年の降順に並べ、チェックは0本から始まる', () => {
      render(<WatchedListPage {...createComponentProperties()} />);

      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes.map(box => box.getAttribute('aria-label'))).toEqual([
        '落下の解剖学',
        '逆転のトライアングル',
        'チタン',
      ]);
      expect(screen.getByTestId('watched-count')).toHaveTextContent('0');
      expect(screen.getByText('/ 3')).toBeInTheDocument();
    });

    it('チェックすると本数が増え、localStorage に保存される', async () => {
      const user = userEvent.setup();
      render(<WatchedListPage {...createComponentProperties()} />);

      await user.click(screen.getByRole('checkbox', {name: 'チタン'}));

      expect(screen.getByTestId('watched-count')).toHaveTextContent('1');
      expect(screen.getByText('33%')).toBeInTheDocument();
      await waitFor(() => {
        expect(storedUids()).toEqual(['uid-2021']);
      });
    });

    it('保存済みのチェックを復元する（他のリストの映画はそのまま）', async () => {
      localStorage.setItem(
        WATCHED_STORAGE_KEY,
        JSON.stringify({uids: ['uid-2022', 'uid-other']}),
      );
      render(<WatchedListPage {...createComponentProperties()} />);

      await waitFor(() => {
        expect(
          screen.getByRole('checkbox', {name: '逆転のトライアングル'}),
        ).toBeChecked();
      });
      expect(screen.getByTestId('watched-count')).toHaveTextContent('1');
      expect(storedUids()).toEqual(['uid-2022', 'uid-other']);
    });

    it('各作品が映画詳細ページへリンクする', () => {
      render(<WatchedListPage {...createComponentProperties()} />);

      expect(
        screen
          .getAllByRole('link', {name: /詳細/})
          .map(link => link.getAttribute('href')),
      ).toEqual(['/movies/uid-2023', '/movies/uid-2022', '/movies/uid-2021']);
    });

    it('結果を共有すると成績と共有URLをクリップボードに入れる', async () => {
      const user = userEvent.setup();
      const writeText = vi
        .spyOn(navigator.clipboard, 'writeText')
        .mockResolvedValue();
      render(<WatchedListPage {...createComponentProperties()} />);

      await user.click(screen.getByRole('checkbox', {name: 'チタン'}));
      await user.click(screen.getByRole('button', {name: '結果を共有'}));

      expect(writeText).toHaveBeenCalledWith(
        `カンヌ国際映画祭 パルム・ドールの受賞作、3本中1本観てた（33%）\nhttps://shine-film.com/watched/palme-dor?s=${encodeWatched(ORDER, new Set(['uid-2021']))}`,
      );
      expect(
        screen.getByRole('button', {name: 'コピーしました'}),
      ).toBeInTheDocument();
    });

    it('リセットは2段階で、このリストの映画だけを外す', async () => {
      localStorage.setItem(
        WATCHED_STORAGE_KEY,
        JSON.stringify({uids: ['uid-2022', 'uid-other']}),
      );
      const user = userEvent.setup();
      render(<WatchedListPage {...createComponentProperties()} />);
      await waitFor(() => {
        expect(screen.getByTestId('watched-count')).toHaveTextContent('1');
      });

      await user.click(
        screen.getByRole('button', {name: 'このリストのチェックを消す'}),
      );
      expect(screen.getByTestId('watched-count')).toHaveTextContent('1');

      await user.click(screen.getByRole('button', {name: '本当に消す'}));

      expect(screen.getByTestId('watched-count')).toHaveTextContent('0');
      await waitFor(() => {
        expect(storedUids()).toEqual(['uid-other']);
      });
    });
  });

  describe('shared view', () => {
    const shared = encodeWatched(ORDER, new Set(['uid-2021', 'uid-2023']));

    it('共有された成績を表示し、チェックは操作できない', () => {
      render(<WatchedListPage {...createComponentProperties(shared)} />);

      expect(
        screen.getByText('共有された結果を見ています'),
      ).toBeInTheDocument();
      expect(screen.getByTestId('watched-count')).toHaveTextContent('2');
      expect(screen.getByRole('checkbox', {name: 'チタン'})).toBeChecked();
      expect(screen.getByRole('checkbox', {name: 'チタン'})).toBeDisabled();
      expect(screen.getByRole('link', {name: '自分もやる'})).toHaveAttribute(
        'href',
        '/watched/palme-dor',
      );
    });

    it('引き継ぐと自分のチェックと和集合になり、編集できるようになる', async () => {
      localStorage.setItem(
        WATCHED_STORAGE_KEY,
        JSON.stringify({uids: ['uid-2022']}),
      );
      const user = userEvent.setup();
      render(<WatchedListPage {...createComponentProperties(shared)} />);

      await user.click(
        screen.getByRole('button', {name: 'この結果を引き継ぐ'}),
      );

      expect(screen.getByTestId('watched-count')).toHaveTextContent('3');
      expect(screen.getByRole('checkbox', {name: 'チタン'})).toBeEnabled();
      expect(
        screen.queryByText('共有された結果を見ています'),
      ).not.toBeInTheDocument();
      await waitFor(() => {
        expect(new Set(storedUids())).toEqual(
          new Set(['uid-2021', 'uid-2022', 'uid-2023']),
        );
      });
    });
  });
});
