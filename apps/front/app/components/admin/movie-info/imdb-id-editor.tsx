import {useState} from 'react';
import type {PerformImdbUpdate} from './types';

type ImdbIdEditorProperties = {
  imdbId: string | undefined;
  imdbError: string | undefined;
  onImdbErrorChange: (error?: string) => void;
  performImdbUpdate: PerformImdbUpdate;
};

export function ImdbIdEditor({
  imdbId,
  imdbError,
  onImdbErrorChange,
  performImdbUpdate,
}: ImdbIdEditorProperties) {
  const [editingImdbId, setEditingImdbId] = useState(false);
  const [newImdbId, setNewImdbId] = useState('');
  const [fetchTmdbData, setFetchTmdbData] = useState(false);

  const updateImdbId = async () => {
    const trimmedImdbId = newImdbId.trim();
    const imdbIdValue = trimmedImdbId || undefined;

    try {
      const success = await performImdbUpdate(imdbIdValue, {
        fetchTmdbData,
      });

      if (!success) {
        return;
      }

      setEditingImdbId(false);
      setNewImdbId('');
      onImdbErrorChange();
      setFetchTmdbData(false);

      globalThis.alert?.('IMDb IDを更新しました');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to update IMDb ID';
      onImdbErrorChange(message);
      console.error('Update IMDb ID error:', error);
    }
  };

  return (
    <div>
      <div className="flex items-center space-x-2 mb-2">
        <strong className="text-gray-700">IMDb ID:</strong>
        {editingImdbId ? (
          <div className="flex items-center space-x-2">
            <input
              type="text"
              value={newImdbId}
              onChange={event => {
                setNewImdbId(event.target.value);
              }}
              className="px-2 py-1 border border-gray-300 rounded text-sm"
              placeholder="tt1234567"
            />
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="fetchTmdbData"
                checked={fetchTmdbData}
                onChange={event => {
                  setFetchTmdbData(event.target.checked);
                }}
                className="mr-1"
              />
              <label htmlFor="fetchTmdbData" className="text-sm">
                TMDb から追加データを取得
              </label>
            </div>
            <button
              type="button"
              onClick={updateImdbId}
              className="bg-blue-600 text-white px-2 py-1 rounded text-xs hover:bg-blue-700">
              保存
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingImdbId(false);
                setNewImdbId('');
                onImdbErrorChange();
                setFetchTmdbData(false);
              }}
              className="bg-gray-500 text-white px-2 py-1 rounded text-xs hover:bg-gray-600">
              キャンセル
            </button>
          </div>
        ) : (
          <div className="flex items-center space-x-2">
            <span>{imdbId || '未設定'}</span>
            <button
              type="button"
              onClick={() => {
                setEditingImdbId(true);
                setNewImdbId(imdbId || '');
              }}
              className="text-blue-600 hover:text-blue-800 text-sm">
              編集
            </button>
          </div>
        )}
      </div>
      {imdbError && <p className="text-red-600 text-sm">{imdbError}</p>}
    </div>
  );
}
