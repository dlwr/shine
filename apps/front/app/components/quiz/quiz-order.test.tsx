import '@testing-library/jest-dom';
import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {QuizOrder} from './quiz-order';

const ORDER = {
  date: '2026-08-16',
  movies: [
    {uid: 'movie-a', title: '赤ひげ', posterUrl: 'https://example.com/a.jpg'},
    {uid: 'movie-b', title: '東京物語', posterUrl: 'https://example.com/b.jpg'},
  ],
};

const RELEASE_DATES = {
  movies: [
    {uid: 'movie-a', releaseDate: '1965-04-03'},
    {uid: 'movie-b', releaseDate: '1953-11-03'},
  ],
};

function stubAnswer() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ok: true, json: async () => RELEASE_DATES})),
  );
}

describe('QuizOrder', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('2本の題名を選べるように並べる', () => {
    render(<QuizOrder order={ORDER} apiUrl="http://api" />);

    expect(screen.getByRole('button', {name: /赤ひげ/})).toBeInTheDocument();
  });

  it('答える前は公開日を出さない', () => {
    render(<QuizOrder order={ORDER} apiUrl="http://api" />);

    expect(screen.queryByText(/1953/)).not.toBeInTheDocument();
  });

  it('選んだ2本を送って答え合わせする', async () => {
    stubAnswer();
    render(<QuizOrder order={ORDER} apiUrl="http://api" />);

    await userEvent.click(screen.getByRole('button', {name: /東京物語/}));

    expect(fetch).toHaveBeenCalledWith(
      'http://api/quiz/order/answer',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({movieUids: ['movie-a', 'movie-b']}),
      }),
    );
  });

  it('先に公開された方を選ぶと正解', async () => {
    stubAnswer();
    render(<QuizOrder order={ORDER} apiUrl="http://api" />);

    await userEvent.click(screen.getByRole('button', {name: /東京物語/}));

    expect(await screen.findByText('正解！')).toBeInTheDocument();
  });

  it('後に公開された方を選ぶと不正解', async () => {
    stubAnswer();
    render(<QuizOrder order={ORDER} apiUrl="http://api" />);

    await userEvent.click(screen.getByRole('button', {name: /赤ひげ/}));

    expect(await screen.findByText('残念！')).toBeInTheDocument();
  });

  it('答えたら公開日を出す', async () => {
    stubAnswer();
    render(<QuizOrder order={ORDER} apiUrl="http://api" />);

    await userEvent.click(screen.getByRole('button', {name: /赤ひげ/}));

    expect(await screen.findByText('1953年11月3日')).toBeInTheDocument();
  });

  it('答えたら映画のページへのリンクを出す', async () => {
    stubAnswer();
    render(<QuizOrder order={ORDER} apiUrl="http://api" />);

    await userEvent.click(screen.getByRole('button', {name: /赤ひげ/}));

    expect(await screen.findByRole('link', {name: /東京物語/})).toHaveAttribute(
      'href',
      '/movies/movie-b',
    );
  });

  it('同じ日の答えは読み込み直しても残る', async () => {
    stubAnswer();
    const {unmount} = render(<QuizOrder order={ORDER} apiUrl="http://api" />);
    await userEvent.click(screen.getByRole('button', {name: /赤ひげ/}));
    await screen.findByText('残念！');
    unmount();

    render(<QuizOrder order={ORDER} apiUrl="http://api" />);

    expect(await screen.findByText('残念！')).toBeInTheDocument();
  });
});
