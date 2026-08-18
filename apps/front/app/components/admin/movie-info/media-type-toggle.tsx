import {useCallback, useState} from 'react';
import {adminFetch, getAdminToken, readErrorMessage} from '@/lib/admin-fetch';
import type {MovieDetails} from './types';

type MediaTypeToggleProperties = {
  movieData: MovieDetails;
  apiUrl: string;
  movieId: string;
  onMovieDataUpdate: (movieData: MovieDetails) => void;
};

export function MediaTypeToggle({
  movieData,
  apiUrl,
  movieId,
  onMovieDataUpdate,
}: MediaTypeToggleProperties) {
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const toggle = useCallback(async () => {
    if (updating) return;

    if (!getAdminToken()) {
      location.assign('/admin/login');
      return;
    }

    const newType = movieData.mediaType === 'tv' ? 'movie' : 'tv';

    setUpdating(true);
    setError(undefined);

    try {
      const response = await adminFetch(`${apiUrl}/admin/movies/${movieId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({mediaType: newType}),
      });

      if (response.status === 401) {
        return;
      }

      if (!response.ok) {
        throw new Error(
          await readErrorMessage(
            response,
            'メディアタイプの更新に失敗しました',
          ),
        );
      }

      onMovieDataUpdate({...movieData, mediaType: newType});
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : 'メディアタイプの更新に失敗しました';
      setError(message);
      console.error('Update mediaType error:', caughtError);
    } finally {
      setUpdating(false);
    }
  }, [updating, movieData, apiUrl, movieId, onMovieDataUpdate]);

  return (
    <div>
      <div className="flex items-center space-x-2">
        <strong className="text-gray-700">メディアタイプ:</strong>
        <button
          type="button"
          disabled={updating}
          className={`rounded px-2 py-0.5 text-xs font-medium ${
            movieData.mediaType === 'tv'
              ? 'bg-blue-100 text-blue-700'
              : 'bg-gray-100 text-gray-700'
          } disabled:opacity-50`}
          onClick={() => {
            void toggle();
          }}>
          {updating
            ? '更新中...'
            : movieData.mediaType === 'tv'
              ? 'TV'
              : '映画'}
        </button>
        <span className="text-xs text-gray-400">（クリックで切替）</span>
      </div>
      {error && <p className="text-red-600 text-sm mt-1">{error}</p>}
    </div>
  );
}
