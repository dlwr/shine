import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {TmdbAutoFetch} from './tmdb-auto-fetch';

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
  Object.defineProperties(globalThis, {
  	fetch: {
	    value: vi.fn(),
	    writable: true,
	    configurable: true,
	  },
  	alert: {
	    value: vi.fn(),
	    writable: true,
	    configurable: true,
	  },
  });
});

describe('TmdbAutoFetch', () => {
  it('IMDb IDが未設定の場合は自動取得ブロックを表示しない', () => {
    render(
      <TmdbAutoFetch
        apiUrl="http://localhost:8787"
        movieId="movie-1"
        imdbId={undefined}
        onMovieDataUpdate={vi.fn()}
      />,
    );

    expect(screen.queryByText('TMDb自動取得:')).not.toBeInTheDocument();
  });

  it('ボタンでPOST /admin/movies/:id/auto-fetch-tmdbを呼ぶ', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auto-fetch-tmdb')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            fetchResults: {
              tmdbIdSet: true,
              postersAdded: 2,
              translationsAdded: 1,
            },
          }),
        });
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({}),
      });
    });

    render(
      <TmdbAutoFetch
        apiUrl="http://localhost:8787"
        movieId="movie-1"
        imdbId="tt7654321"
        onMovieDataUpdate={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', {name: 'IMDb IDからTMDbデータを自動取得'}),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8787/admin/movies/movie-1/auto-fetch-tmdb',
        expect.objectContaining({method: 'POST'}),
      );
    });

    await waitFor(() => {
      expect(globalThis.alert).toHaveBeenCalledWith(
        'TMDbデータを自動取得しました:\n• TMDb IDを設定\n• 2枚のポスターを追加\n• 1件の翻訳を追加\n',
      );
    });
  });
});
