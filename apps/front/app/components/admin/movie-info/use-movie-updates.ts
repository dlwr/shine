import {useCallback} from 'react';
import {adminFetch, getAdminToken} from '@/lib/admin-fetch';
import type {MovieDetails, PerformImdbUpdate, PerformTmdbUpdate} from './types';

type UseMovieUpdatesOptions = {
  apiUrl: string;
  movieId: string;
  onMovieDataUpdate: (movieData: MovieDetails) => void;
};

export function useMovieUpdates({
  apiUrl,
  movieId,
  onMovieDataUpdate,
}: UseMovieUpdatesOptions) {
  const refreshMovieData = useCallback(async () => {
    const movieResponse = await adminFetch(`${apiUrl}/admin/movies/${movieId}`);

    if (movieResponse.ok) {
      const data = (await movieResponse.json()) as MovieDetails;
      onMovieDataUpdate(data);
    }
  }, [apiUrl, movieId, onMovieDataUpdate]);

  const performImdbUpdate = useCallback<PerformImdbUpdate>(
    async (imdbIdValue, options = {}) => {
      if (!getAdminToken()) {
        globalThis.location.href = '/admin/login';
        return false;
      }

      const body = {
        imdbId: imdbIdValue,
        fetchTmdbData: Boolean(options.fetchTmdbData),
        refreshData: Boolean(options.fetchTmdbData),
      };

      try {
        const response = await adminFetch(
          `${apiUrl}/admin/movies/${movieId}/imdb-id`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
          },
        );

        if (response.status === 401) {
          return false;
        }

        if (!response.ok) {
          const errorData = (await response
            .json()
            .catch(() => ({error: 'Unknown error'}))) as {error?: string};
          throw new Error(errorData.error || 'Failed to update IMDb ID');
        }

        await refreshMovieData();

        return true;
      } catch (error) {
        throw error instanceof Error
          ? error
          : new Error('Failed to update IMDb ID');
      }
    },
    [apiUrl, movieId, refreshMovieData],
  );

  const performTmdbUpdate = useCallback<PerformTmdbUpdate>(
    async (tmdbIdValue, options = {}) => {
      if (!getAdminToken()) {
        globalThis.location.href = '/admin/login';
        return false;
      }

      const body = {
        tmdbId: tmdbIdValue,
        refreshData: Boolean(options.refreshData),
      };

      try {
        const response = await adminFetch(
          `${apiUrl}/admin/movies/${movieId}/tmdb-id`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
          },
        );

        if (response.status === 401) {
          return false;
        }

        if (response.status === 404) {
          throw new Error('TMDb ID更新機能はまだ実装されていません');
        }

        if (!response.ok) {
          const errorData = (await response
            .json()
            .catch(() => ({error: 'Unknown error'}))) as {error?: string};
          throw new Error(errorData.error || 'Failed to update TMDb ID');
        }

        await refreshMovieData();

        return true;
      } catch (error) {
        throw error instanceof Error
          ? error
          : new Error('Failed to update TMDb ID');
      }
    },
    [apiUrl, movieId, refreshMovieData],
  );

  return {refreshMovieData, performImdbUpdate, performTmdbUpdate};
}
