import '@testing-library/jest-dom';
import {render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {RelatedMovies} from './related-movies';

const movies = [
  {uid: 'r1', title: '関連映画A', year: 2022, posterUrl: 'https://img/a.jpg'},
  {uid: 'r2', title: '関連映画B', year: 2021},
  {uid: 'r3', title: '関連映画C'},
];

describe('RelatedMovies', () => {
  it('映画が無ければ何も描画しない', () => {
    const {container} = render(<RelatedMovies movies={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('見出しを出す', () => {
    render(<RelatedMovies movies={movies} />);

    expect(screen.getByText('関連映画')).toBeInTheDocument();
  });

  it('各映画を詳細ページへのリンクにする', () => {
    render(<RelatedMovies movies={movies} />);

    expect(screen.getByRole('link', {name: /関連映画A/})).toHaveAttribute(
      'href',
      '/movies/r1',
    );
  });

  it('製作年を出す', () => {
    render(<RelatedMovies movies={movies} />);

    expect(screen.getByText('2022')).toBeInTheDocument();
  });

  it('製作年が無ければ年を出さない', () => {
    render(<RelatedMovies movies={[movies[2]]} />);

    expect(
      screen.getByRole('link', {name: /関連映画C/}).textContent,
    ).not.toMatch(/\d{4}/);
  });
});
