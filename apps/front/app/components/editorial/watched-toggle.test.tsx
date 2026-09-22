import '@testing-library/jest-dom';
import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {WatchedToggle} from './watched-toggle';
import {WATCHED_STORAGE_KEY} from '@/lib/watched';

function storedUids(): string[] {
  return (
    (
      JSON.parse(localStorage.getItem(WATCHED_STORAGE_KEY) ?? '{}') as {
        uids?: string[];
      }
    ).uids ?? []
  );
}

describe('WatchedToggle', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('匿名の「観た」の記録', () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'));

    beforeEach(() => {
      fetchMock.mockClear();
      vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('押したら API に観た印を送る', async () => {
      const user = userEvent.setup();
      render(<WatchedToggle uid="movie-1" apiUrl="https://api.example" />);

      await user.click(screen.getByRole('button', {name: '観た'}));

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.example/movies/movie-1/watched',
        {method: 'POST', headers: {}},
      );
    });

    it('管理者でログインしていればトークンを付ける', async () => {
      localStorage.setItem('adminToken', 'jwt-token');
      const user = userEvent.setup();
      render(<WatchedToggle uid="movie-1" apiUrl="https://api.example" />);

      await user.click(screen.getByRole('button', {name: '観た'}));

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.example/movies/movie-1/watched',
        {method: 'POST', headers: {Authorization: 'Bearer jwt-token'}},
      );
    });

    it('外すときは送らない', async () => {
      const user = userEvent.setup();
      render(<WatchedToggle uid="movie-1" apiUrl="https://api.example" />);

      await user.click(screen.getByRole('button', {name: '観た'}));
      await user.click(screen.getByRole('button', {name: '✓ 観た'}));

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('apiUrl が無ければ送らない', async () => {
      const user = userEvent.setup();
      render(<WatchedToggle uid="movie-1" />);

      await user.click(screen.getByRole('button', {name: '観た'}));

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('送信に失敗しても観た状態は残す', async () => {
      fetchMock.mockRejectedValueOnce(new Error('offline'));
      const user = userEvent.setup();
      render(<WatchedToggle uid="movie-1" apiUrl="https://api.example" />);

      await user.click(screen.getByRole('button', {name: '観た'}));

      await waitFor(() => {
        expect(storedUids()).toEqual(['movie-1']);
      });
      expect(screen.getByRole('button', {name: '✓ 観た'})).toBeInTheDocument();
    });
  });

  it('未チェックの「観た」ボタンから始まる', () => {
    render(<WatchedToggle uid="movie-1" />);

    expect(screen.getByRole('button', {name: '観た'})).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('押すと観た状態になり、集合に足して進捗への導線を出す', async () => {
    localStorage.setItem(
      WATCHED_STORAGE_KEY,
      JSON.stringify({uids: ['movie-other']}),
    );
    const user = userEvent.setup();
    render(<WatchedToggle uid="movie-1" />);

    await user.click(screen.getByRole('button', {name: '観た'}));

    expect(screen.getByRole('button', {name: '✓ 観た'})).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(storedUids()).toEqual(['movie-other', 'movie-1']);
    expect(
      screen.getByRole('link', {name: /観た映画チェック/}),
    ).toHaveAttribute('href', '/watched');
  });

  it('もう一度押すと外す', async () => {
    const user = userEvent.setup();
    render(<WatchedToggle uid="movie-1" />);

    await user.click(screen.getByRole('button', {name: '観た'}));
    await user.click(screen.getByRole('button', {name: '✓ 観た'}));

    expect(screen.getByRole('button', {name: '観た'})).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(storedUids()).toEqual([]);
  });

  it('保存済みならチェック済みで表示する', async () => {
    localStorage.setItem(
      WATCHED_STORAGE_KEY,
      JSON.stringify({uids: ['movie-1']}),
    );
    render(<WatchedToggle uid="movie-1" />);

    await waitFor(() => {
      expect(screen.getByRole('button', {name: '✓ 観た'})).toBeInTheDocument();
    });
  });

  it('今月の1本を観たら、ひとこと残す欄へ誘う', async () => {
    const user = userEvent.setup();
    render(<WatchedToggle uid="movie-1" isMonthlyPick />);

    await user.click(screen.getByRole('button', {name: '観た'}));

    expect(
      screen.getByRole('link', {name: /今月の1本.*ひとこと/}),
    ).toHaveAttribute('href', '#article-links');
  });

  it('今月の1本でも、観ていなければ誘わない', () => {
    render(<WatchedToggle uid="movie-1" isMonthlyPick />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('今月の1本でなければ、観ても投稿には誘わない', async () => {
    const user = userEvent.setup();
    render(<WatchedToggle uid="movie-1" />);

    await user.click(screen.getByRole('button', {name: '観た'}));

    expect(
      screen.queryByRole('link', {name: /ひとこと/}),
    ).not.toBeInTheDocument();
  });
});
