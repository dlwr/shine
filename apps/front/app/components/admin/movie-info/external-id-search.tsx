import {useEffect, useMemo, useState} from 'react';
import type {FormEvent} from 'react';
import {adminFetch, getAdminToken} from '@/lib/admin-fetch';
import type {
  ExternalIdSearchResponse,
  ExternalIdSuggestion,
  MovieDetails,
  PerformImdbUpdate,
  PerformTmdbUpdate,
} from './types';

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
  const preferredSearch = useMemo(() => {
    const translations = movieData.translations ?? [];

    const findTranslation = (code: string) =>
      translations.find(
        translation =>
          translation.languageCode === code &&
          translation.content &&
          translation.content.trim() !== '',
      );

    const japanese = findTranslation('ja');
    if (japanese?.content) {
      return {text: japanese.content.trim(), language: 'ja-JP' as const};
    }

    const english = findTranslation('en');
    if (english?.content) {
      return {text: english.content.trim(), language: 'en-US' as const};
    }

    const fallback = translations.find(
      translation => translation.content && translation.content.trim() !== '',
    );

    if (fallback?.content) {
      const language =
        fallback.languageCode === 'ja'
          ? ('ja-JP' as const)
          : ('en-US' as const);

      return {text: fallback.content.trim(), language};
    }

    return {text: '', language: 'ja-JP' as const};
  }, [movieData.translations]);

  const preferredSearchQuery = preferredSearch.text;
  const preferredSearchLanguage = preferredSearch.language;

  const [showIdSearch, setShowIdSearch] = useState(false);
  const [idSearchQuery, setIdSearchQuery] = useState('');
  const [idSearchLanguage, setIdSearchLanguage] = useState<'ja-JP' | 'en-US'>(
    'ja-JP',
  );
  const [idSearchYear, setIdSearchYear] = useState('');
  const [idSearchResults, setIdSearchResults] = useState<
    ExternalIdSuggestion[]
  >([]);
  const [idSearchError, setIdSearchError] = useState<string | undefined>();
  const [searchingIds, setSearchingIds] = useState(false);
  const [idSearchUsedQuery, setIdSearchUsedQuery] = useState<
    string | undefined
  >();
  const [idSearchUsedYear, setIdSearchUsedYear] = useState<
    number | undefined
  >();
  const [idSearchInitialized, setIdSearchInitialized] = useState(false);

  useEffect(() => {
    if (!showIdSearch && !movieData.imdbId && !movieData.tmdbId) {
      setShowIdSearch(true);
    }
  }, [movieData.imdbId, movieData.tmdbId, showIdSearch]);

  useEffect(() => {
    setIdSearchResults([]);
    setIdSearchError(undefined);
    setIdSearchInitialized(false);
  }, [movieData.uid]);

  useEffect(() => {
    if (!showIdSearch || idSearchInitialized) {
      return;
    }

    if (preferredSearchQuery) {
      setIdSearchQuery(preferredSearchQuery);
      setIdSearchLanguage(preferredSearchLanguage);
    }

    setIdSearchYear(movieData.year ? String(movieData.year) : '');
    setIdSearchInitialized(true);
  }, [
    showIdSearch,
    idSearchInitialized,
    preferredSearchQuery,
    preferredSearchLanguage,
    movieData.year,
  ]);

  const searchExternalIds = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();

    const trimmedQuery = idSearchQuery.trim();
    if (!trimmedQuery) {
      setIdSearchError('検索キーワードを入力してください');
      setIdSearchResults([]);
      return;
    }

    const parameters = new URLSearchParams();
    parameters.set('query', trimmedQuery);
    parameters.set('language', idSearchLanguage);
    parameters.set('limit', '5');

    if (idSearchYear.trim()) {
      const parsedYear = Number(idSearchYear.trim());
      if (Number.isNaN(parsedYear)) {
        setIdSearchError('年は数値で入力してください');
        return;
      }

      parameters.set('year', String(parsedYear));
    }

    if (!getAdminToken()) {
      location.assign('/admin/login');
      return;
    }

    setSearchingIds(true);
    setIdSearchError(undefined);
    setIdSearchResults([]);
    setIdSearchUsedQuery(undefined);
    setIdSearchUsedYear(undefined);

    try {
      const response = await adminFetch(
        `${apiUrl}/admin/movies/${movieId}/external-id-search?${parameters.toString()}`,
      );

      if (response.status === 401) {
        return;
      }

      if (!response.ok) {
        const errorData = (await response
          .json()
          .catch(() => ({error: '検索に失敗しました'}))) as {error?: string};
        throw new Error(errorData.error || '検索に失敗しました');
      }

      const data = (await response.json()) as ExternalIdSearchResponse;
      setIdSearchResults(data.results);
      setIdSearchUsedQuery(data.usedQuery);
      setIdSearchUsedYear(data.usedYear);

      if (data.results.length === 0) {
        setIdSearchError('該当する候補が見つかりませんでした');
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '検索に失敗しました';
      setIdSearchResults([]);
      setIdSearchError(message);
      console.error('External ID search error:', error);
    } finally {
      setSearchingIds(false);
    }
  };

  const applyImdbIdFromSuggestion = async (
    suggestion: ExternalIdSuggestion,
    options: {fetchTmdbData?: boolean} = {},
  ) => {
    if (!suggestion.imdbId) {
      setIdSearchError('この候補にはIMDb IDが含まれていません');
      return;
    }

    try {
      const success = await performImdbUpdate(suggestion.imdbId, options);

      if (!success) {
        return;
      }

      onImdbErrorChange();
      setIdSearchError(undefined);
      globalThis.alert?.('IMDb IDを設定しました');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'IMDb IDの設定に失敗しました';
      setIdSearchError(message);
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
      setIdSearchError(undefined);
      globalThis.alert?.('TMDb IDを設定しました');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'TMDb IDの設定に失敗しました';
      setIdSearchError(message);
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
      setIdSearchError(undefined);
      globalThis.alert?.('IMDb/TMDb IDを設定しました');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'IDの設定に失敗しました';
      setIdSearchError(message);
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
          onClick={() => {
            setShowIdSearch(previous => !previous);
          }}
          className="text-sm text-blue-600 hover:text-blue-800">
          {showIdSearch ? '閉じる' : '開く'}
        </button>
      </div>

      {showIdSearch && (
        <div className="space-y-4">
          <form
            onSubmit={event => {
              void searchExternalIds(event);
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
                value={idSearchQuery}
                onChange={event => {
                  setIdSearchQuery(event.target.value);
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
                value={idSearchLanguage}
                onChange={event => {
                  const value = event.target.value as 'ja-JP' | 'en-US';
                  setIdSearchLanguage(value);
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
                value={idSearchYear}
                onChange={event => {
                  setIdSearchYear(event.target.value);
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
                disabled={searchingIds}
                className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 disabled:bg-gray-400">
                {searchingIds ? '検索中...' : '検索'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIdSearchQuery(preferredSearchQuery);
                  setIdSearchLanguage(preferredSearchLanguage);
                  setIdSearchYear(movieData.year ? String(movieData.year) : '');
                  setIdSearchResults([]);
                  setIdSearchError(undefined);
                  setIdSearchUsedQuery(undefined);
                  setIdSearchUsedYear(undefined);
                }}
                className="bg-gray-500 text-white px-3 py-1 rounded text-sm hover:bg-gray-600">
                条件をリセット
              </button>
            </div>
          </form>

          {searchingIds && (
            <div className="text-sm text-gray-600">検索中です...</div>
          )}

          {idSearchError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-red-600">
              {idSearchError}
            </div>
          )}

          {!searchingIds && idSearchResults.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs text-gray-500">
                検索キーワード:{' '}
                <span className="font-medium text-gray-700">
                  {idSearchUsedQuery ?? idSearchQuery}
                </span>
                {idSearchUsedYear !== undefined &&
                  !Number.isNaN(idSearchUsedYear) && (
                    <span className="ml-2">
                      公開年:{' '}
                      <span className="font-medium text-gray-700">
                        {idSearchUsedYear}
                      </span>
                    </span>
                  )}
              </div>
              <ul className="space-y-3">
                {idSearchResults.map(result => (
                  <li
                    key={result.tmdbId}
                    className="border border-gray-200 rounded-lg bg-gray-50 p-3">
                    <div className="flex flex-col gap-3 md:flex-row md:justify-between md:items-start">
                      <div className="space-y-1">
                        <p className="font-semibold text-gray-900">
                          {result.title}{' '}
                          {result.releaseDate && (
                            <span className="text-sm text-gray-600">
                              ({result.releaseDate})
                            </span>
                          )}
                        </p>
                        {result.originalTitle &&
                          result.originalTitle !== result.title && (
                            <p className="text-sm text-gray-600">
                              原題: {result.originalTitle}
                            </p>
                          )}
                        <div className="text-xs text-gray-500 space-x-2">
                          <span>TMDb: {result.tmdbId}</span>
                          {result.imdbId && <span>IMDb: {result.imdbId}</span>}
                        </div>
                        {typeof result.yearDifference === 'number' &&
                          movieData.year && (
                            <p className="text-xs text-gray-500">
                              公開年差: {result.yearDifference}年
                            </p>
                          )}
                        {result.overview && (
                          <p className="text-xs text-gray-600">
                            {result.overview.length > 180
                              ? `${result.overview.slice(0, 180)}...`
                              : result.overview}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col gap-2 md:items-end">
                        <div className="flex flex-wrap gap-2">
                          {result.imdbId && (
                            <button
                              type="button"
                              onClick={() => {
                                void applyImdbIdFromSuggestion(result);
                              }}
                              className="bg-blue-600 text-white px-2 py-1 rounded text-xs hover:bg-blue-700">
                              IMDb IDを設定
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              void applyTmdbIdFromSuggestion(result);
                            }}
                            className="bg-green-600 text-white px-2 py-1 rounded text-xs hover:bg-green-700">
                            TMDb IDを設定
                          </button>
                        </div>
                        {result.imdbId && (
                          <button
                            type="button"
                            onClick={() => {
                              void applyBothIdsFromSuggestion(result);
                            }}
                            className="bg-indigo-600 text-white px-2 py-1 rounded text-xs hover:bg-indigo-700">
                            両方を設定
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!searchingIds && idSearchResults.length === 0 && !idSearchError && (
            <p className="text-sm text-gray-600">
              キーワードを入力して「検索」を押すと候補が表示されます。
            </p>
          )}
        </div>
      )}
    </div>
  );
}
