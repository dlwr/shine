import type {
  ExternalIdSuggestion,
  MovieDetails,
  PerformImdbUpdate,
  PerformTmdbUpdate,
} from './types';
import {SuggestionList} from './external-id-search/suggestion-list';
import {useExternalIdSearch} from './external-id-search/use-external-id-search';

type ExternalIdSearchProperties = {
  apiUrl: string;
  movieId: string;
  movieData: MovieDetails;
  performImdbUpdate: PerformImdbUpdate;
  performTmdbUpdate: PerformTmdbUpdate;
  onImdbErrorChange: (error?: string) => void;
  onTmdbErrorChange: (error?: string) => void;
};

export function ExternalIdSearch({
  apiUrl,
  movieId,
  movieData,
  performImdbUpdate,
  performTmdbUpdate,
  onImdbErrorChange,
  onTmdbErrorChange,
}: ExternalIdSearchProperties) {
  const idSearch = useExternalIdSearch({apiUrl, movieId, movieData});

  const applyImdbIdFromSuggestion = async (
    suggestion: ExternalIdSuggestion,
    options: {fetchTmdbData?: boolean} = {},
  ) => {
    if (!suggestion.imdbId) {
      idSearch.setError('この候補にはIMDb IDが含まれていません');
      return;
    }

    try {
      const success = await performImdbUpdate(suggestion.imdbId, options);

      if (!success) {
        return;
      }

      onImdbErrorChange();
      idSearch.setError(undefined);
      globalThis.alert?.('IMDb IDを設定しました');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'IMDb IDの設定に失敗しました';
      idSearch.setError(message);
      console.error('Apply IMDb ID error:', error);
    }
  };

  const applyTmdbIdFromSuggestion = async (
    suggestion: ExternalIdSuggestion,
    options: {refreshData?: boolean} = {},
  ) => {
    try {
      const success = await performTmdbUpdate(suggestion.tmdbId, options);

      if (!success) {
        return;
      }

      onTmdbErrorChange();
      idSearch.setError(undefined);
      globalThis.alert?.('TMDb IDを設定しました');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'TMDb IDの設定に失敗しました';
      idSearch.setError(message);
      console.error('Apply TMDb ID error:', error);
    }
  };

  const applyBothIdsFromSuggestion = async (
    suggestion: ExternalIdSuggestion,
  ) => {
    if (!suggestion.imdbId) {
      await applyTmdbIdFromSuggestion(suggestion);
      return;
    }

    try {
      const imdbUpdated = await performImdbUpdate(suggestion.imdbId);
      if (!imdbUpdated) {
        return;
      }

      const tmdbUpdated = await performTmdbUpdate(suggestion.tmdbId);
      if (!tmdbUpdated) {
        return;
      }

      onImdbErrorChange();
      onTmdbErrorChange();
      idSearch.setError(undefined);
      globalThis.alert?.('IMDb/TMDb IDを設定しました');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'IDの設定に失敗しました';
      idSearch.setError(message);
      console.error('Apply both IDs error:', error);
    }
  };

  return (
    <div className="border-t pt-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <strong className="text-gray-700">外部ID検索</strong>
          <p className="text-sm text-gray-600">
            IMDb/TMDbの候補を検索し、この映画にIDを適用できます
          </p>
        </div>
        <button
          type="button"
          onClick={idSearch.toggleOpen}
          className="text-sm text-blue-600 hover:text-blue-800">
          {idSearch.open ? '閉じる' : '開く'}
        </button>
      </div>

      {idSearch.open && (
        <div className="space-y-4">
          <form
            onSubmit={event => {
              void idSearch.search(event);
            }}
            className="grid gap-3 md:grid-cols-12 md:items-end">
            <div className="md:col-span-6">
              <label
                className="block text-sm font-medium text-gray-700 mb-1"
                htmlFor="external-id-search-query">
                検索キーワード
              </label>
              <input
                type="text"
                id="external-id-search-query"
                value={idSearch.query}
                onChange={event => {
                  idSearch.setQuery(event.target.value);
                }}
                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                placeholder="作品名"
              />
            </div>
            <div className="md:col-span-3">
              <label
                className="block text-sm font-medium text-gray-700 mb-1"
                htmlFor="external-id-search-language">
                検索言語
              </label>
              <select
                id="external-id-search-language"
                value={idSearch.language}
                onChange={event => {
                  idSearch.setLanguage(event.target.value as 'ja-JP' | 'en-US');
                }}
                className="w-full px-2 py-1 border border-gray-300 rounded text-sm">
                <option value="ja-JP">日本語</option>
                <option value="en-US">英語</option>
              </select>
            </div>
            <div className="md:col-span-3">
              <label
                className="block text-sm font-medium text-gray-700 mb-1"
                htmlFor="external-id-search-year">
                公開年 (任意)
              </label>
              <input
                type="number"
                id="external-id-search-year"
                value={idSearch.year}
                onChange={event => {
                  idSearch.setYear(event.target.value);
                }}
                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                placeholder="2024"
                min="1888"
                max="2100"
              />
            </div>
            <div className="md:col-span-12 flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={idSearch.searching}
                className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 disabled:bg-gray-400">
                {idSearch.searching ? '検索中...' : '検索'}
              </button>
              <button
                type="button"
                onClick={idSearch.reset}
                className="bg-gray-500 text-white px-3 py-1 rounded text-sm hover:bg-gray-600">
                条件をリセット
              </button>
            </div>
          </form>

          {idSearch.searching && (
            <div className="text-sm text-gray-600">検索中です...</div>
          )}

          {idSearch.error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-red-600">
              {idSearch.error}
            </div>
          )}

          {!idSearch.searching && idSearch.results.length > 0 && (
            <SuggestionList
              results={idSearch.results}
              usedQuery={idSearch.usedQuery ?? idSearch.query}
              usedYear={idSearch.usedYear}
              showYearDifference={Boolean(movieData.year)}
              onApplyImdb={suggestion => {
                void applyImdbIdFromSuggestion(suggestion);
              }}
              onApplyTmdb={suggestion => {
                void applyTmdbIdFromSuggestion(suggestion);
              }}
              onApplyBoth={suggestion => {
                void applyBothIdsFromSuggestion(suggestion);
              }}
            />
          )}

          {!idSearch.searching &&
            idSearch.results.length === 0 &&
            !idSearch.error && (
              <p className="text-sm text-gray-600">
                キーワードを入力して「検索」を押すと候補が表示されます。
              </p>
            )}
        </div>
      )}
    </div>
  );
}
