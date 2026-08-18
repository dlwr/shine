import {useState} from 'react';
import {adminFetch, getAdminToken, readErrorMessage} from '@/lib/admin-fetch';
import type {MovieDetails} from './types';

type YearEditorProperties = {
  apiUrl: string;
  movieId: string;
  year: number;
  onMovieDataUpdate: (movieData: MovieDetails) => void;
};

export function YearEditor({
  apiUrl,
  movieId,
  year,
  onMovieDataUpdate,
}: YearEditorProperties) {
  const [editingYear, setEditingYear] = useState(false);
  const [newYear, setNewYear] = useState('');
  const [yearError, setYearError] = useState<string | undefined>();

  const updateYear = async () => {
    const yearNumber = newYear.trim() ? Number(newYear.trim()) : undefined;

    if (
      newYear.trim() &&
      (yearNumber === undefined ||
        Number.isNaN(yearNumber) ||
        yearNumber < 1888 ||
        yearNumber > 2100)
    ) {
      setYearError('年は1888から2100の間で入力してください');
      return;
    }

    if (!getAdminToken()) {
      location.assign('/admin/login');
      return;
    }

    try {
      const response = await adminFetch(`${apiUrl}/admin/movies/${movieId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          year: yearNumber,
        }),
      });

      if (response.status === 401) {
        return;
      }

      if (!response.ok) {
        throw new Error(
          await readErrorMessage(response, 'Failed to update year'),
        );
      }

      const movieResponse = await adminFetch(
        `${apiUrl}/admin/movies/${movieId}`,
      );

      if (movieResponse.ok) {
        const data = (await movieResponse.json()) as MovieDetails;
        onMovieDataUpdate(data);
      }

      setEditingYear(false);
      setNewYear('');
      setYearError(undefined);

      globalThis.alert?.('公開年を更新しました');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to update year';
      setYearError(message);
      console.error('Update year error:', error);
    }
  };

  return (
    <div>
      <div className="flex items-center space-x-2 mb-2">
        <strong className="text-gray-700">公開年:</strong>
        {editingYear ? (
          <div className="flex items-center space-x-2">
            <input
              type="number"
              value={newYear}
              onChange={event => {
                setNewYear(event.target.value);
              }}
              className="px-2 py-1 border border-gray-300 rounded text-sm w-24"
              placeholder="2024"
              min="1888"
              max="2100"
            />
            <button
              type="button"
              onClick={updateYear}
              className="bg-blue-600 text-white px-2 py-1 rounded text-xs hover:bg-blue-700">
              保存
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingYear(false);
                setNewYear('');
                setYearError(undefined);
              }}
              className="bg-gray-500 text-white px-2 py-1 rounded text-xs hover:bg-gray-600">
              キャンセル
            </button>
          </div>
        ) : (
          <div className="flex items-center space-x-2">
            <span>{year || '未設定'}</span>
            <button
              type="button"
              onClick={() => {
                setEditingYear(true);
                setNewYear(year?.toString() || '');
              }}
              className="text-blue-600 hover:text-blue-800 text-sm">
              編集
            </button>
          </div>
        )}
      </div>
      {yearError && <p className="text-red-600 text-sm">{yearError}</p>}
    </div>
  );
}
