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

  it('shows TSUTAYA DISCAS button with hidden form in streaming menu', async () => {
    render(<MovieCard movie={baseMovie} locale="ja" />);

    const posterImage = screen.getByRole('img', {
      name: `${baseMovie.title} poster`,
    });
    fireEvent.mouseEnter(posterImage.parentElement as HTMLElement);

    expect(await screen.findByText('検索する')).toBeInTheDocument();

    // TSUTAYA DISCAS button should be present
    const discasButton = screen.getByText('TSUTAYA DISCAS');
    expect(discasButton).toBeInTheDocument();
    expect(discasButton.tagName).toBe('BUTTON');

    // Hidden form should exist with correct attributes
    const form = discasButton.closest('form');
    expect(form).not.toBeNull();
    expect(form).toHaveAttribute('accept-charset', 'Shift_JIS');
    expect(form).toHaveAttribute(
      'action',
      'https://movie-tsutaya.tsite.jp/netdvd/dvd/searchDvdBd.do',
    );
    expect(form).toHaveAttribute('method', 'GET');
    expect(form).toHaveAttribute('target', '_blank');

    // Hidden input should contain the Japanese title
    const hiddenInput = form!.querySelector('input[name="k"]');
    expect(hiddenInput).not.toBeNull();
    expect(hiddenInput).toHaveAttribute('value', '別れる決心');
  });

  it('uses Japanese title for TSUTAYA DISCAS search even in English locale', async () => {
    const movieWithTranslations: MovieCardMovie = {
      ...baseMovie,
      title: undefined,
      translations: [
        {languageCode: 'en', content: 'Decision to Leave', isDefault: 0},
        {languageCode: 'ja', content: '別れる決心', isDefault: 1},
      ],
    };

    render(<MovieCard movie={movieWithTranslations} locale="en" />);

    const posterImage = screen.getByRole('img', {
      name: 'Decision to Leave poster',
    });
    fireEvent.mouseEnter(posterImage.parentElement as HTMLElement);

    expect(await screen.findByText('Search on')).toBeInTheDocument();

    const form = screen.getByText('TSUTAYA DISCAS').closest('form');
    const hiddenInput = form!.querySelector('input[name="k"]');
    // Should use Japanese title for TSUTAYA DISCAS regardless of locale
    expect(hiddenInput).toHaveAttribute('value', '別れる決心');
  });
});
