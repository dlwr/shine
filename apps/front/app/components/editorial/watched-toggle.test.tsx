import '@testing-library/jest-dom';
import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach, describe, expect, it} from 'vitest';
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
});
