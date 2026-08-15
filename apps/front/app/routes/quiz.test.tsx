import '@testing-library/jest-dom';
import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import QuizPage, {loader} from './quiz';
import type {Route} from './+types/quiz';
import {QUIZ_STATE_KEY} from '@/lib/quiz-state';

globalThis.fetch = vi.fn();

const cast = <T,>(value?: unknown): T => value as T;

const PUZZLE = {date: '2026-08-16', maxAttempts: 6, poolSize: 1396};
const CANDIDATES = [
  {uid: 'movie-a', title: '赤ひげ', year: 1965},
  {uid: 'movie-b', title: '東京物語', year: 1953},
];

const createComponentProperties = (): Route.ComponentProps =>
  cast<Route.ComponentProps>({
    loaderData: {
      puzzle: PUZZLE,
      candidates: CANDIDATES,
      apiUrl: 'http://localhost:8787',
      locale: 'ja',
    },
    params: {},
    matches: [],
  });

describe('Quiz page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    globalThis.localStorage.clear();
  });

  describe('loader', () => {
    it('出題と回答候補をまとめて取得する', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch
        .mockResolvedValueOnce({ok: true, json: async () => PUZZLE} as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({candidates: CANDIDATES}),
        } as Response);

      const request = new Request('http://localhost:3000/quiz');
      const result = await loader(
        cast<Route.LoaderArgs>({
          context: {
            cloudflare: {env: {PUBLIC_API_URL: 'http://localhost:8787'}},
          },
          request,
          params: {},
          matches: [],
        }),
      );

      expect(result.candidates).toEqual(CANDIDATES);
    });

    it('APIが失敗したら502を投げる', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue({ok: false} as Response);

      await expect(
        loader(
          cast<Route.LoaderArgs>({
            context: {cloudflare: {env: {}}},
            request: new Request('http://localhost:3000/quiz'),
            params: {},
            matches: [],
          }),
        ),
      ).rejects.toMatchObject({status: 502});
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

    it('入力に一致する候補を出す', async () => {
      render(<QuizPage {...createComponentProperties()} />);

      await userEvent.type(screen.getByLabelText(/邦題で回答/), '東京');

      expect(
        await screen.findByRole('button', {name: /東京物語/}),
      ).toBeInTheDocument();
    });

    it('外すとヒントが開く', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          correct: false,
          hint: {label: '製作年', value: '1965年'},
        }),
      } as Response);

      render(<QuizPage {...createComponentProperties()} />);
      await userEvent.type(screen.getByLabelText(/邦題で回答/), '東京');
      await userEvent.click(
        await screen.findByRole('button', {name: /東京物語/}),
      );

      expect(await screen.findByText('1965年')).toBeInTheDocument();
    });

    it('当たると答えを見せる', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          correct: true,
          answer: {uid: 'movie-a', title: '赤ひげ', year: 1965},
        }),
      } as Response);

      render(<QuizPage {...createComponentProperties()} />);
      await userEvent.type(screen.getByLabelText(/邦題で回答/), '赤ひげ');
      await userEvent.click(
        await screen.findByRole('button', {name: /赤ひげ/}),
      );

      expect(await screen.findByText('正解！')).toBeInTheDocument();
    });

    it('リロードしても進行を引き継ぐ', async () => {
      globalThis.localStorage.setItem(
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
      globalThis.localStorage.setItem(
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
