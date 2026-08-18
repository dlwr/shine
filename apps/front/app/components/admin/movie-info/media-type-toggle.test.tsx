import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {MediaTypeToggle} from './media-type-toggle';
import type {MovieDetails} from './types';

const movieData: MovieDetails = {
  uid: 'movie-1',
  year: 2023,
  originalLanguage: 'ja',
  imdbId: undefined,
  tmdbId: undefined,
  mediaType: 'movie',
  translations: [],
  nominations: [],
  posters: [],
};

const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
  configurable: true,
});

beforeEach(() => {
  vi.resetAllMocks();
  mockLocalStorage.getItem.mockReturnValue('admin-token');
  Object.defineProperty(globalThis, 'fetch', {
    value: vi.fn(),
    writable: true,
    configurable: true,
  });
});

describe('MediaTypeToggle', () => {
  it('現在のメディアタイプを表示する', () => {
    render(
      <MediaTypeToggle
        movieData={movieData}
        apiUrl="http://localhost:8787"
        movieId="movie-1"
        onMovieDataUpdate={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', {name: '映画'})).toBeInTheDocument();
  });

  it('クリックでPUT /admin/movies/:idにmediaTypeを送信する', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    const onMovieDataUpdate = vi.fn();

    render(
      <MediaTypeToggle
        movieData={movieData}
        apiUrl="http://localhost:8787"
        movieId="movie-1"
        onMovieDataUpdate={onMovieDataUpdate}
      />,
    );

    fireEvent.click(screen.getByRole('button', {name: '映画'}));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8787/admin/movies/movie-1',
        expect.objectContaining({method: 'PUT'}),
      );
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({mediaType: 'tv'});

    await waitFor(() => {
      expect(onMovieDataUpdate).toHaveBeenCalledWith({
        ...movieData,
        mediaType: 'tv',
      });
    });
  });
});
