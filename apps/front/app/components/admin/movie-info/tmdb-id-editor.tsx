import {useState} from 'react';
import {adminFetch, getAdminToken} from '@/lib/admin-fetch';
import type {MovieDetails, PerformTmdbUpdate} from './types';

type TmdbIdEditorProperties = {
  apiUrl: string;
  movieId: string;
  tmdbId: number | undefined;
  tmdbError: string | undefined;
  onTmdbErrorChange: (error?: string) => void;
  onRefreshErrorChange: (error?: string) => void;
  performTmdbUpdate: PerformTmdbUpdate;
  onMovieDataUpdate: (movieData: MovieDetails) => void;
};

export function TmdbIdEditor({
  apiUrl,
  movieId,
  tmdbId,
  tmdbError,
  onTmdbErrorChange,
  onRefreshErrorChange,
  performTmdbUpdate,
  onMovieDataUpdate,
}: TmdbIdEditorProperties) {
  const [editingTmdbId, setEditingTmdbId] = useState(false);
  const [newTmdbId, setNewTmdbId] = useState('');
  const [tmdbRefreshing, setTmdbRefreshing] = useState(false);

  const updateTmdbId = async () => {
    const trimmedTmdbId = newTmdbId.trim();
    let tmdbIdNumber: number | undefined;
    if (trimmedTmdbId !== '') {
      tmdbIdNumber = Number.parseInt(trimmedTmdbId, 10);
    }

    if (
      trimmedTmdbId &&
      (tmdbIdNumber === undefined ||
        Number.isNaN(tmdbIdNumber) ||
        tmdbIdNumber <= 0)
    ) {
      onTmdbErrorChange('TMDb IDは正の整数である必要があります');
      return;
    }

    try {
      const success = await performTmdbUpdate(tmdbIdNumber);

      if (!success) {
        return;
      }

      setEditingTmdbId(false);
      setNewTmdbId('');
      onTmdbErrorChange();

      globalThis.alert?.('TMDb IDを更新しました');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to update TMDb ID';
      onTmdbErrorChange(message);
      console.error('Update TMDb ID error:', error);
    }
  };

  const refreshTMDatabaseData = async () => {
    if (!tmdbId) {
      onRefreshErrorChange('TMDb IDが設定されていません');
      return;
    }

    if (!getAdminToken()) {
      globalThis.location.href = '/admin/login';
      return;
    }

    setTmdbRefreshing(true);
    onRefreshErrorChange();

    try {
      const response = await adminFetch(
        `${apiUrl}/admin/movies/${movieId}/refresh-tmdb`,
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
        throw new Error(errorData.error || 'Failed to refresh TMDb data');
      }

      const movieResponse = await adminFetch(
        `${apiUrl}/admin/movies/${movieId}`,
      );

      if (movieResponse.ok) {
        const data = (await movieResponse.json()) as MovieDetails;
        onMovieDataUpdate(data);
      }

      globalThis.alert?.('TMDb情報を更新しました');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to refresh TMDb data';
      onRefreshErrorChange(message);
      console.error('Refresh TMDb data error:', error);
    } finally {
      setTmdbRefreshing(false);
    }
  };

  return (
    <div>
      <div className="flex items-center space-x-2 mb-2">
        <strong className="text-gray-700">TMDb ID:</strong>
        {editingTmdbId ? (
          <div className="flex items-center space-x-2">
            <input
              type="number"
              value={newTmdbId}
              onChange={event => {
                setNewTmdbId(event.target.value);
              }}
              className="px-2 py-1 border border-gray-300 rounded text-sm w-24"
              placeholder="12345"
            />
            <button
              type="button"
              onClick={updateTmdbId}
              className="bg-blue-600 text-white px-2 py-1 rounded text-xs hover:bg-blue-700">
              保存
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingTmdbId(false);
                setNewTmdbId('');
                onTmdbErrorChange();
              }}
              className="bg-gray-500 text-white px-2 py-1 rounded text-xs hover:bg-gray-600">
              キャンセル
            </button>
          </div>
        ) : (
          <div className="flex items-center space-x-2">
            <span>{tmdbId || '未設定'}</span>
            <button
              type="button"
              onClick={() => {
                setEditingTmdbId(true);
                setNewTmdbId(tmdbId?.toString() || '');
              }}
              className="text-blue-600 hover:text-blue-800 text-sm">
              編集
            </button>
            {tmdbId && (
              <button
                type="button"
                onClick={refreshTMDatabaseData}
                disabled={tmdbRefreshing}
                className="bg-green-600 text-white px-2 py-1 rounded text-xs hover:bg-green-700 disabled:bg-gray-400">
                {tmdbRefreshing ? '更新中...' : 'TMDb情報更新'}
              </button>
            )}
          </div>
        )}
      </div>
      {tmdbError && <p className="text-red-600 text-sm">{tmdbError}</p>}
    </div>
  );
}
