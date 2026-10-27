import '@testing-library/jest-dom';
import {render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {MovieExits} from './movie-exits';

describe('MovieExits', () => {
  it('同じ言語の映画へリンクする', () => {
    render(<MovieExits originalLanguage="fr" releaseDate={undefined} />);

    expect(
      screen.getByRole('link', {name: 'フランス語の映画'}),
    ).toHaveAttribute('href', '/languages/fr');
  });

  it('同じ日に初公開された映画へリンクする', () => {
    render(<MovieExits originalLanguage="fr" releaseDate="1999-09-05" />);

    expect(
      screen.getByRole('link', {name: '9月5日に初公開された映画'}),
    ).toHaveAttribute('href', '/on-this-day?d=09-05');
  });

  it('公開日が分からなければ初公開の日へのリンクを出さない', () => {
    render(<MovieExits originalLanguage="fr" releaseDate={undefined} />);

    expect(screen.queryByRole('link', {name: /初公開/})).toBeNull();
  });

  it('今日の二本立てへリンクする', () => {
    render(<MovieExits originalLanguage="fr" releaseDate={undefined} />);

    expect(screen.getByRole('link', {name: '今日の二本立て'})).toHaveAttribute(
      'href',
      '/double-feature',
    );
  });
});
