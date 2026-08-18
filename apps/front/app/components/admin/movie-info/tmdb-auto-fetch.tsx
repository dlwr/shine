import {useState} from 'react';
import {adminFetch, getAdminToken} from '@/lib/admin-fetch';
import type {MovieDetails} from './types';

type TmdbAutoFetchProperties = {
  apiUrl: string;
  movieId: string;
  imdbId: string | undefined;
  onMovieDataUpdate: (movieData: MovieDetails) => void;
};

export function TmdbAutoFetch({
  apiUrl,
  movieId,
  imdbId,
  onMovieDataUpdate,
}: TmdbAutoFetchProperties) {
  const [autoFetching, setAutoFetching] = useState(false);
  const [autoFetchError, setAutoFetchError] = useState<string | undefined>();

  const autoFetchTMDatabaseData = async () => {
    if (!imdbId) {
      setAutoFetchError('IMDb IDが設定されていません');
      return;
    }

    if (!getAdminToken()) {
      location.assign('/admin/login');
      return;
    }

    setAutoFetching(true);
    setAutoFetchError(undefined);

    try {
      const response = await adminFetch(
        `${apiUrl}/admin/movies/${movieId}/auto-fetch-tmdb`,
        {
          method: 'POST',
        },
      );

      if (response.status === 401) {
        return;
      }

      if (!response.ok) {
        const errorData = (await response
          .json()
          .catch(() => ({error: 'Unknown error'}))) as {error?: string};
        throw new Error(errorData.error || 'TMDb自動取得に失敗しました');
      }

      const result = (await response.json()) as {
        success: boolean;
        fetchResults: {
          tmdbIdSet: boolean;
          postersAdded: number;
          translationsAdded: number;
        };
      };

      const movieResponse = await adminFetch(
        `${apiUrl}/admin/movies/${movieId}`,
      );

      if (movieResponse.ok) {
        const data = (await movieResponse.json()) as MovieDetails;
        onMovieDataUpdate(data);
      }

      const {fetchResults} = result;
      let message = 'TMDbデータを自動取得しました:\n';

      if (fetchResults.tmdbIdSet) {
        message += '• TMDb IDを設定\n';
      }

      if (fetchResults.postersAdded > 0) {
        message += `• ${fetchResults.postersAdded}枚のポスターを追加\n`;
      }

      if (fetchResults.translationsAdded > 0) {
        message += `• ${fetchResults.translationsAdded}件の翻訳を追加\n`;
      }

      globalThis.alert?.(message);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'TMDb自動取得に失敗しました';
      setAutoFetchError(message);
      console.error('Auto-fetch TMDb data error:', error);
    } finally {
      setAutoFetching(false);
    }
  };

  return (
    <>
      {imdbId && (
        <div className="border-t pt-4">
          <div className="flex items-center space-x-2 mb-2">
            <strong className="text-gray-700">TMDb自動取得:</strong>
            <button
              type="button"
              onClick={autoFetchTMDatabaseData}
              disabled={autoFetching}
              className="bg-orange-600 text-white px-3 py-1 rounded text-sm hover:bg-orange-700 disabled:bg-gray-400">
              {autoFetching ? '取得中...' : 'IMDb IDからTMDbデータを自動取得'}
            </button>
          </div>
          <p className="text-sm text-gray-600 mb-2">
            IMDb IDを使ってTMDb IDを検索し、ポスターと翻訳を自動取得します
          </p>
        </div>
      )}

      {autoFetchError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-red-600">
          {autoFetchError}
        </div>
      )}
    </>
  );
}
