import {fireEvent, render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import type {MovieCardMovie} from './movie-card';
import {MovieCard} from './movie-card';

const baseMovie: MovieCardMovie = {
  uid: 'test-movie',
  title: '別れる決心',
  year: 2022,
  tmdbId: 761_851,
  posterUrl: 'https://example.com/poster.jpg',
};

describe('MovieCard streaming menu', () => {
  it('shows streaming links (including JustWatch) on hover', async () => {
    render(<MovieCard movie={baseMovie} locale="ja" />);

    // Hover over the poster area to open the streaming menu
    const posterImage = screen.getByRole('img', {
      name: `${baseMovie.title} poster`,
    });
    fireEvent.mouseEnter(posterImage.parentElement as HTMLElement);

    // The menu header should appear
    expect(await screen.findByText('検索する')).toBeInTheDocument();

    // JustWatch link should be present with encoded title
    const justWatchLink = screen.getByText('JustWatch');
    expect(justWatchLink).toHaveAttribute(
      'href',
      `https://www.justwatch.com/jp/%E6%A4%9C%E7%B4%A2?q=${encodeURIComponent(baseMovie.title ?? '')}`,
    );
  });
});
