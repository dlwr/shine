import '@testing-library/jest-dom';
import {render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {MovieExits} from './movie-exits';

describe('MovieExits', () => {
  it('同じ日に初公開された映画へリンクする', () => {
    render(<MovieExits movieUid="movie-1" releaseDate="1999-09-05" />);

    expect(
      screen.getByRole('link', {name: '9月5日に初公開された映画'}),
    ).toHaveAttribute('href', '/on-this-day?d=09-05');
  });

  it('公開日が分からなければ初公開の日へのリンクを出さない', () => {
    render(<MovieExits movieUid="movie-1" releaseDate={undefined} />);

    expect(screen.queryByRole('link', {name: /初公開/})).toBeNull();
  });

  it('今日の映画しりとりへリンクする', () => {
    render(<MovieExits movieUid="movie-1" releaseDate={undefined} />);

    expect(
      screen.getByRole('link', {name: '今日の映画しりとり'}),
    ).toHaveAttribute('href', '/shiritori');
  });

  it('今日の二本立てへリンクする', () => {
    render(<MovieExits movieUid="movie-1" releaseDate={undefined} />);

    expect(screen.getByRole('link', {name: '今日の二本立て'})).toHaveAttribute(
      'href',
      '/double-feature',
    );
  });

  it('この映画から別の映画への距離へリンクする', () => {
    render(<MovieExits movieUid="movie-1" releaseDate={undefined} />);

    expect(
      screen.getByRole('link', {name: 'この映画から別の映画への距離'}),
    ).toHaveAttribute('href', '/connect?from=movie-1');
  });
});
