import '@testing-library/jest-dom';
import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import QuizPage, {loader, meta} from './quiz';
import type {Route} from './+types/quiz';
import {QUIZ_STATE_KEY} from '@/lib/quiz-state';
import {createEnvironmentContext} from '@/lib/api';
import {createMockContext} from '@/lib/test-context';

vi.stubGlobal('fetch', vi.fn());

const OriginalImage = Image;

const cast = <T,>(value?: unknown): T => value as T;

const PUZZLE = {date: '2026-08-16', maxAttempts: 6, poolSize: 1396};
const CANDIDATES = [
  {uid: 'movie-a', title: '赤ひげ', year: 1965},
  {uid: 'movie-b', title: '東京物語', year: 1953},
];

const MONTHLY = {uid: 'movie-m', title: '浮雲', year: 1955, awards: []};

function stubApi(guess?: unknown) {
  vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
    if (String(input).includes('/quiz/candidates')) {
      return cast<Response>({
        ok: true,
        json: async () => ({candidates: CANDIDATES}),
      });
    }

    return cast<Response>({ok: true, json: async () => guess});
  });
}

const createComponentProperties = (
  overrides: Record<string, unknown> = {},
): Route.ComponentProps =>
  cast<Route.ComponentProps>({
    loaderData: {
      puzzle: PUZZLE,
      apiUrl: 'http://localhost:8787',
      locale: 'ja',
      ...overrides,
    },
    params: {},
    matches: [],
  });

function dailyRequests(): string[] {
  return vi
    .mocked(fetch)
    .mock.calls.map(([input]) => String(input))
    .filter(url => url.includes('/quiz/daily'));
}

async function loadAt(url: string) {
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    json: async () => PUZZLE,
  } as Response);

  return loader(
    cast<Route.LoaderArgs>({
      context: createMockContext(),
      request: new Request(url),
      params: {},
      matches: [],
    }),
  );
}

describe('Quiz page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
  });

  describe('loader', () => {
    it('出題は API の service binding 経由で取得する', async () => {
      const bindingFetch = vi.fn(async (url: string) =>
        cast<Response>({
          ok: true,
          json: async () =>
            url.includes('/quiz/daily') ? PUZZLE : {monthly: undefined},
        }),
      );

      const result = await loader(
        cast<Route.LoaderArgs>({
          context: createMockContext('http://localhost:8787', {
            API: {fetch: bindingFetch},
          }),
          request: new Request('http://localhost:3000/quiz'),
          params: {},
          matches: [],
        }),
      );

      expect(result.puzzle).toEqual(PUZZLE);
      expect(bindingFetch).toHaveBeenCalledWith(
        'https://shine-api/quiz/daily',
        expect.anything(),
      );
      expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    });

    it('本番では Image Transformations を使う印を載せる', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => PUZZLE,
      } as Response);

      const result = await loader(
        cast<Route.LoaderArgs>({
          context: createMockContext('http://localhost:8787', {
            PUBLIC_IMAGE_TRANSFORMATIONS: 'true',
          }),
          request: new Request('http://localhost:3000/quiz'),
          params: {},
          matches: [],
        }),
      );

      expect(result.transformImages).toBe(true);
    });

    it('印が無ければ Image Transformations を使わない', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => PUZZLE,
      } as Response);

      const result = await loader(
        cast<Route.LoaderArgs>({
          context: createMockContext(),
          request: new Request('http://localhost:3000/quiz'),
          params: {},
          matches: [],
        }),
      );

      expect(result.transformImages).toBe(false);
    });

    it('出題を取得する', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => PUZZLE,
      } as Response);

      const result = await loader(
        cast<Route.LoaderArgs>({
          context: createMockContext(),
          request: new Request('http://localhost:3000/quiz'),
          params: {},
          matches: [],
        }),
      );

      expect(result.puzzle).toEqual(PUZZLE);
    });

    it('回答候補は取得しない', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => PUZZLE,
      } as Response);

      await loader(
        cast<Route.LoaderArgs>({
          context: createMockContext(),
          request: new Request('http://localhost:3000/quiz'),
          params: {},
          matches: [],
        }),
      );

      const requested = mockFetch.mock.calls.map(([input]) => String(input));
      expect(requested.some(url => url.includes('/quiz/candidates'))).toBe(
        false,
      );
    });

    it('回答候補をloaderDataに載せない', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => PUZZLE,
      } as Response);

      const result = await loader(
        cast<Route.LoaderArgs>({
          context: createMockContext(),
          request: new Request('http://localhost:3000/quiz'),
          params: {},
          matches: [],
        }),
      );

      expect(result).not.toHaveProperty('candidates');
    });

    it('今月の1本を一緒に取得する', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch
        .mockResolvedValueOnce({ok: true, json: async () => PUZZLE} as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            monthly: {
              ...MONTHLY,
              description: 'x',
              posterUrls: [
                {
                  url: 'https://example.com/en.jpg',
                  languageCode: 'en',
                  isPrimary: 1,
                },
                {
                  url: 'https://example.com/ja.jpg',
                  languageCode: 'ja',
                  isPrimary: 0,
                },
              ],
            },
          }),
        } as Response);

      const result = await loader(
        cast<Route.LoaderArgs>({
          context: createMockContext(),
          request: new Request('http://localhost:3000/quiz'),
          params: {},
          matches: [],
        }),
      );

      expect(result.monthly).toEqual({
        ...MONTHLY,
        posterUrl: 'https://example.com/ja.jpg',
      });
    });

    it('今月の1本が取れなくてもクイズは出す', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch
        .mockResolvedValueOnce({ok: true, json: async () => PUZZLE} as Response)
        .mockRejectedValueOnce(new Error('down'));

      const result = await loader(
        cast<Route.LoaderArgs>({
          context: createMockContext(),
          request: new Request('http://localhost:3000/quiz'),
          params: {},
          matches: [],
        }),
      );

      expect(result.puzzle).toEqual(PUZZLE);
      expect(result.monthly).toBeUndefined();
    });

    describe('共有リンクの出題日', () => {
      beforeEach(() => {
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(new Date('2026-08-17T03:00:00Z'));
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it('過去の日付が付いていればその日の出題を取る', async () => {
        await loadAt('http://localhost:3000/quiz?d=2026-08-16');

        expect(dailyRequests()).toEqual([
          'http://localhost:8787/quiz/daily?date=2026-08-16',
        ]);
      });

      it('過去の日付の出題には過去の問題の印を付ける', async () => {
        const result = await loadAt('http://localhost:3000/quiz?d=2026-08-16');

        expect(result.isPastPuzzle).toBe(true);
      });

      it('当日の日付なら当日の出題として取る', async () => {
        const result = await loadAt('http://localhost:3000/quiz?d=2026-08-17');

        expect(result.isPastPuzzle).toBe(false);
      });

      it('未来の日付は無視して当日の出題を取る', async () => {
        await loadAt('http://localhost:3000/quiz?d=2026-08-18');

        expect(dailyRequests()).toEqual(['http://localhost:8787/quiz/daily']);
      });

      it('日付の形でない値は無視して当日の出題を取る', async () => {
        await loadAt('http://localhost:3000/quiz?d=yesterday');

        expect(dailyRequests()).toEqual(['http://localhost:8787/quiz/daily']);
      });
    });

    it('APIが失敗したら502を投げる', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue({ok: false} as Response);

      await expect(
        loader(
          cast<Route.LoaderArgs>({
            context: createEnvironmentContext({}),
            request: new Request('http://localhost:3000/quiz'),
            params: {},
            matches: [],
          }),
        ),
      ).rejects.toMatchObject({status: 502});
    });
  });

  describe('meta', () => {
    it('クイズ専用のOG画像を出題日付きで指す', () => {
      const descriptors = meta(
        cast<Route.MetaArgs>({loaderData: {puzzle: PUZZLE, locale: 'ja'}}),
      );

      expect(descriptors).toContainEqual({
        property: 'og:image',
        content: 'https://shine-film.com/og/quiz.png?date=2026-08-16',
      });
    });

    it('og:urlに出題日を付けてSNSのカードキャッシュを分ける', () => {
      const descriptors = meta(
        cast<Route.MetaArgs>({loaderData: {puzzle: PUZZLE, locale: 'ja'}}),
      );

      expect(descriptors).toContainEqual({
        property: 'og:url',
        content: 'https://shine-film.com/quiz?d=2026-08-16',
      });
    });

    it('出題が取れないときのog:urlは日付を付けない', () => {
      const descriptors = meta(
        cast<Route.MetaArgs>({loaderData: {locale: 'ja'}}),
      );

      expect(descriptors).toContainEqual({
        property: 'og:url',
        content: 'https://shine-film.com/quiz',
      });
    });
  });

  describe('プレイ', () => {
    it('最初はズームしたポスターを出す', () => {
      render(<QuizPage {...createComponentProperties()} />);

      expect(screen.getByAltText('ポスターの一部')).toHaveAttribute(
        'src',
        '/quiz/poster.png?date=2026-08-16&stage=0',
      );
    });

    it('Image Transformations が使えるならポスターをその経路で出す', () => {
      render(
        <QuizPage {...createComponentProperties({transformImages: true})} />,
      );

      expect(screen.getByAltText('ポスターの一部')).toHaveAttribute(
        'src',
        '/cdn-cgi/image/format=auto,quality=80/quiz/poster.png?date=2026-08-16&stage=0',
      );
    });

    describe('ポスターの先読み', () => {
      const prefetched: string[] = [];

      beforeEach(() => {
        prefetched.length = 0;
        vi.stubGlobal(
          'Image',
          class {
            set src(value: string) {
              prefetched.push(value);
            }
          },
        );
      });

      afterEach(() => {
        vi.stubGlobal('Image', OriginalImage);
      });

      it('次の段階のポスターを先読みする', async () => {
        render(<QuizPage {...createComponentProperties()} />);

        await waitFor(() => {
          expect(prefetched).toContain(
            '/quiz/poster.png?date=2026-08-16&stage=1',
          );
        });
      });

      it('正解したときに出る最後の段階のポスターを先読みする', async () => {
        render(<QuizPage {...createComponentProperties()} />);

        await waitFor(() => {
          expect(prefetched).toContain(
            '/quiz/poster.png?date=2026-08-16&stage=6',
          );
        });
      });

      it('Image Transformations が使えるなら先読みもその経路で取る', async () => {
        render(
          <QuizPage {...createComponentProperties({transformImages: true})} />,
        );

        await waitFor(() => {
          expect(prefetched).toContain(
            '/cdn-cgi/image/format=auto,quality=80/quiz/poster.png?date=2026-08-16&stage=1',
          );
        });
      });

      it('外したら、その次の段階を先読みする', async () => {
        stubApi({
          correct: false,
          hint: {label: '製作年', value: '1965年'},
        });

        render(<QuizPage {...createComponentProperties()} />);
        await userEvent.click(
          screen.getByRole('button', {name: /パスしてヒントを見る/}),
        );

        await waitFor(() => {
          expect(prefetched).toContain(
            '/quiz/poster.png?date=2026-08-16&stage=2',
          );
        });
      });
    });

    it('回答候補はブラウザから取りに行く', async () => {
      stubApi();

      render(<QuizPage {...createComponentProperties()} />);

      await waitFor(() => {
        const requested = vi
          .mocked(fetch)
          .mock.calls.map(([input]) => String(input));
        expect(requested).toContain('http://localhost:8787/quiz/candidates');
      });
    });

    it('入力に一致する候補を出す', async () => {
      stubApi();

      render(<QuizPage {...createComponentProperties()} />);
      await userEvent.type(screen.getByLabelText(/邦題で回答/), '東京');

      expect(
        await screen.findByRole('button', {name: /東京物語/}),
      ).toBeInTheDocument();
    });

    it('回答候補が取れなくてもパスでヒントは進められる', async () => {
      vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
        if (String(input).includes('/quiz/candidates')) {
          return cast<Response>({ok: false});
        }

        return cast<Response>({
          ok: true,
          json: async () => ({
            correct: false,
            hint: {label: '製作年', value: '1965年'},
          }),
        });
      });

      render(<QuizPage {...createComponentProperties()} />);
      await userEvent.click(
        screen.getByRole('button', {name: /パスしてヒントを見る/}),
      );

      expect(await screen.findByText('1965年')).toBeInTheDocument();
    });

    it('回答候補の中身が壊れていてもパスでヒントは進められる', async () => {
      vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
        if (String(input).includes('/quiz/candidates')) {
          return cast<Response>({ok: true, json: async () => ({})});
        }

        return cast<Response>({
          ok: true,
          json: async () => ({
            correct: false,
            hint: {label: '製作年', value: '1965年'},
          }),
        });
      });

      render(<QuizPage {...createComponentProperties()} />);
      await userEvent.type(screen.getByLabelText(/邦題で回答/), '東京');
      await userEvent.click(
        screen.getByRole('button', {name: /パスしてヒントを見る/}),
      );

      expect(await screen.findByText('1965年')).toBeInTheDocument();
    });

    it('外すとヒントが開く', async () => {
      stubApi({
        correct: false,
        hint: {label: '製作年', value: '1965年'},
      });

      render(<QuizPage {...createComponentProperties()} />);
      await userEvent.type(screen.getByLabelText(/邦題で回答/), '東京');
      await userEvent.click(
        await screen.findByRole('button', {name: /東京物語/}),
      );

      expect(await screen.findByText('1965年')).toBeInTheDocument();
    });

    it('答えが出たら結果をポスターより前に置く', async () => {
      stubApi({
        correct: true,
        answer: {uid: 'movie-a', title: '赤ひげ', year: 1965},
      });

      render(<QuizPage {...createComponentProperties({monthly: MONTHLY})} />);
      await userEvent.type(screen.getByLabelText(/邦題で回答/), '赤ひげ');
      await userEvent.click(
        await screen.findByRole('button', {name: /赤ひげ/}),
      );

      const result = await screen.findByText('正解！');
      const poster = screen.getByAltText('赤ひげ');
      expect(
        result.compareDocumentPosition(poster) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('当たると答えを見せる', async () => {
      stubApi({
        correct: true,
        answer: {uid: 'movie-a', title: '赤ひげ', year: 1965},
      });

      render(<QuizPage {...createComponentProperties()} />);
      await userEvent.type(screen.getByLabelText(/邦題で回答/), '赤ひげ');
      await userEvent.click(
        await screen.findByRole('button', {name: /赤ひげ/}),
      );

      expect(await screen.findByText('正解！')).toBeInTheDocument();
    });

    it('答えが出たら今月の1本へ誘う', async () => {
      stubApi({
        correct: true,
        answer: {uid: 'movie-a', title: '赤ひげ', year: 1965},
      });

      render(<QuizPage {...createComponentProperties({monthly: MONTHLY})} />);
      expect(screen.queryByText(/今月の1本/)).not.toBeInTheDocument();
      await userEvent.type(screen.getByLabelText(/邦題で回答/), '赤ひげ');
      await userEvent.click(
        await screen.findByRole('button', {name: /赤ひげ/}),
      );

      const link = await screen.findByRole('link', {name: /浮雲/});
      expect(link).toHaveAttribute('href', '/movies/movie-m');
      expect(link).toHaveTextContent('今月の1本');
      expect(link).toHaveTextContent('毎月1本、みんなで同じ映画を観る');
    });

    it('今月の1本のカードにポスターを出す', async () => {
      stubApi({
        correct: true,
        answer: {uid: 'movie-a', title: '赤ひげ', year: 1965},
      });

      render(
        <QuizPage
          {...createComponentProperties({
            monthly: {...MONTHLY, posterUrl: 'https://example.com/ja.jpg'},
          })}
        />,
      );
      await userEvent.type(screen.getByLabelText(/邦題で回答/), '赤ひげ');
      await userEvent.click(
        await screen.findByRole('button', {name: /赤ひげ/}),
      );

      const link = await screen.findByRole('link', {name: /浮雲/});
      expect(link.querySelector('img')).toHaveAttribute(
        'src',
        expect.stringContaining('ja.jpg'),
      );
    });

    it('今月の1本のカードは次の問題の案内より前に置く', async () => {
      stubApi({
        correct: true,
        answer: {uid: 'movie-a', title: '赤ひげ', year: 1965},
      });

      render(<QuizPage {...createComponentProperties({monthly: MONTHLY})} />);
      await userEvent.type(screen.getByLabelText(/邦題で回答/), '赤ひげ');
      await userEvent.click(
        await screen.findByRole('button', {name: /赤ひげ/}),
      );

      const link = await screen.findByRole('link', {name: /浮雲/});
      const notice = screen.getByText(/次の問題は明日/);
      expect(
        link.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('答えが出たら X に結果を投稿するリンクを出す', async () => {
      stubApi({
        correct: true,
        answer: {uid: 'movie-a', title: '赤ひげ', year: 1965},
      });

      render(<QuizPage {...createComponentProperties()} />);
      await userEvent.type(screen.getByLabelText(/邦題で回答/), '赤ひげ');
      await userEvent.click(
        await screen.findByRole('button', {name: /赤ひげ/}),
      );

      const link = await screen.findByRole('link', {name: 'X に投稿'});
      const href = link.getAttribute('href');

      expect(href).toContain('https://x.com/intent/post?text=');
      expect(href).toContain(
        encodeURIComponent(`https://shine-film.com/quiz?d=${PUZZLE.date}`),
      );
      expect(href).toContain(encodeURIComponent('SHINE QUIZ'));
    });

    it('答えが出たら Bluesky に結果を投稿するリンクを出す', async () => {
      stubApi({
        correct: true,
        answer: {uid: 'movie-a', title: '赤ひげ', year: 1965},
      });

      render(<QuizPage {...createComponentProperties()} />);
      await userEvent.type(screen.getByLabelText(/邦題で回答/), '赤ひげ');
      await userEvent.click(
        await screen.findByRole('button', {name: /赤ひげ/}),
      );

      expect(
        await screen.findByRole('link', {name: 'Bluesky に投稿'}),
      ).toHaveAttribute(
        'href',
        expect.stringContaining('https://bsky.app/intent/compose?text='),
      );
    });

    it('遊んでいる途中は投稿するリンクを出さない', () => {
      render(<QuizPage {...createComponentProperties()} />);

      expect(
        screen.queryByRole('link', {name: 'X に投稿'}),
      ).not.toBeInTheDocument();
    });

    it('今月の1本が無ければ誘わない', async () => {
      stubApi({
        correct: true,
        answer: {uid: 'movie-a', title: '赤ひげ', year: 1965},
      });

      render(<QuizPage {...createComponentProperties()} />);
      await userEvent.type(screen.getByLabelText(/邦題で回答/), '赤ひげ');
      await userEvent.click(
        await screen.findByRole('button', {name: /赤ひげ/}),
      );

      expect(await screen.findByText('正解！')).toBeInTheDocument();
      expect(screen.queryByText(/今月の1本/)).not.toBeInTheDocument();
    });

    it('過去の問題には今日の問題への導線を出す', () => {
      render(<QuizPage {...createComponentProperties({isPastPuzzle: true})} />);

      expect(screen.getByRole('link', {name: /今日の問題へ/})).toHaveAttribute(
        'href',
        '/quiz',
      );
    });

    it('過去の問題の結果には次の問題の案内を出さない', async () => {
      localStorage.setItem(
        QUIZ_STATE_KEY,
        JSON.stringify({
          date: PUZZLE.date,
          guesses: [{title: '赤ひげ', correct: true}],
          hints: [],
          answer: {uid: 'movie-a', title: '赤ひげ', year: 1965},
          status: 'won',
        }),
      );

      render(<QuizPage {...createComponentProperties({isPastPuzzle: true})} />);

      expect(await screen.findByText('正解！')).toBeInTheDocument();
      expect(screen.queryByText(/次の問題は明日/)).not.toBeInTheDocument();
    });

    it('今日の問題には今日の問題への導線を出さない', () => {
      render(<QuizPage {...createComponentProperties()} />);

      expect(
        screen.queryByRole('link', {name: /今日の問題へ/}),
      ).not.toBeInTheDocument();
    });

    it('過去の問題を開いても、より新しい日の進行を上書きしない', async () => {
      const newer = {
        date: '2026-08-17',
        guesses: [{title: '東京物語', correct: false}],
        hints: [{label: '製作年', value: '1965年'}],
        status: 'playing',
      };
      localStorage.setItem(QUIZ_STATE_KEY, JSON.stringify(newer));

      render(<QuizPage {...createComponentProperties({isPastPuzzle: true})} />);

      await waitFor(() => {
        expect(screen.getByAltText('ポスターの一部')).toBeInTheDocument();
      });
      expect(JSON.parse(localStorage.getItem(QUIZ_STATE_KEY) ?? '')).toEqual(
        newer,
      );
    });

    it('リロードしても進行を引き継ぐ', async () => {
      localStorage.setItem(
        QUIZ_STATE_KEY,
        JSON.stringify({
          date: PUZZLE.date,
          guesses: [{title: '東京物語', correct: false}],
          hints: [{label: '製作年', value: '1965年'}],
          status: 'playing',
        }),
      );

      render(<QuizPage {...createComponentProperties()} />);

      await waitFor(() => {
        expect(screen.getByText('1965年')).toBeInTheDocument();
      });
    });

    it('日付が変わったら前日の進行は捨てる', async () => {
      localStorage.setItem(
        QUIZ_STATE_KEY,
        JSON.stringify({
          date: '2026-08-15',
          guesses: [{title: '東京物語', correct: false}],
          hints: [{label: '製作年', value: '1965年'}],
          status: 'playing',
        }),
      );

      render(<QuizPage {...createComponentProperties()} />);

      await waitFor(() => {
        expect(screen.queryByText('1965年')).not.toBeInTheDocument();
      });
    });
  });
});
