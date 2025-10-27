import {useEffect, useMemo, useState} from 'react';
import type {FormEvent} from 'react';

type MovieDetails = {
  uid: string;
  year: number;
  originalLanguage: string;
  imdbId: string | undefined;
  tmdbId: number | undefined;
  translations: Array<{
    uid: string;
    languageCode: string;
    content: string;
    isDefault: number;
  }>;
  nominations: Array<{
    uid: string;
    isWinner: boolean;
    specialMention: string | undefined;
    category: {uid: string; name: string};
    ceremony: {uid: string; number: number; year: number};
    organization: {uid: string; name: string; shortName: string};
  }>;
  posters: Array<{
    uid: string;
    url: string;
    width: number | undefined;
    height: number | undefined;
    languageCode: string | undefined;
    source: string | undefined;
    isPrimary: number;
  }>;
};

type MovieInfoEditorProps = {
  movieData: MovieDetails;
  apiUrl: string;
  movieId: string;
  onMovieDataUpdate: (movieData: MovieDetails) => void;
};

type ExternalIdSuggestion = {
  tmdbId: number;
  imdbId?: string;
  title: string;
  originalTitle?: string;
  releaseDate?: string;
  overview?: string;
  originalLanguage?: string;
  posterPath?: string;
  popularity?: number;
  voteAverage?: number;
  voteCount?: number;
  yearDifference?: number;
};

type ExternalIdSearchResponse = {
  usedQuery: string;
  usedYear?: number;
  results: ExternalIdSuggestion[];
};

export default function MovieInfoEditor({
  movieData,
  apiUrl,
  movieId,
  onMovieDataUpdate,
}: MovieInfoEditorProps) {
  const [editingImdbId, setEditingImdbId] = useState(false);
  const [newImdbId, setNewImdbId] = useState('');
  const [imdbError, setImdbError] = useState<string | undefined>(undefined);
  const [fetchTmdbData, setFetchTmdbData] = useState(false);

  const [editingTmdbId, setEditingTmdbId] = useState(false);
  const [newTmdbId, setNewTmdbId] = useState('');
  const [tmdbError, setTmdbError] = useState<string | undefined>(undefined);

  const [tmdbRefreshing, setTmdbRefreshing] = useState(false);
  const [tmdbRefreshError, setTmdbRefreshError] = useState<string | undefined>(
    undefined,
  );

  const [autoFetching, setAutoFetching] = useState(false);
  const [autoFetchError, setAutoFetchError] = useState<string | undefined>(
    undefined,
  );

  const [editingYear, setEditingYear] = useState(false);
  const [newYear, setNewYear] = useState('');
  const [yearError, setYearError] = useState<string | undefined>(undefined);

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
        fallback.languageCode === 'ja' ? ('ja-JP' as const) : ('en-US' as const);

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
  const [idSearchError, setIdSearchError] = useState<string | undefined>(
    undefined,
  );
  const [searchingIds, setSearchingIds] = useState(false);
  const [idSearchUsedQuery, setIdSearchUsedQuery] = useState<string | undefined>(
    undefined,
  );
  const [idSearchUsedYear, setIdSearchUsedYear] = useState<number | undefined>(
    undefined,
  );
  const [idSearchInitialized, setIdSearchInitialized] = useState(false);

  useEffect(() => {
    if (!movieData.imdbId && !movieData.tmdbId && !showIdSearch) {
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

  const updateYear = async () => {
    const yearNumber = newYear.trim()
      ? Number.parseInt(newYear.trim(), 10)
      : undefined;

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

    const token = globalThis.localStorage?.getItem('adminToken');
    if (!token) {
      globalThis.location.href = '/admin/login';
      return;
    }

    try {
      const response = await fetch(`${apiUrl}/admin/movies/${movieId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          year: yearNumber,
        }),
      });

      if (response.status === 401) {
        globalThis.localStorage?.removeItem('adminToken');
        globalThis.location.href = '/admin/login';
        return;
      }

      if (!response.ok) {
        const errorData = (await response
          .json()
          .catch(() => ({error: 'Unknown error'}))) as {error?: string};
        throw new Error(errorData.error || 'Failed to update year');
      }

      const movieResponse = await fetch(`${apiUrl}/admin/movies/${movieId}`, {
        headers: {Authorization: `Bearer ${token}`},
      });

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

  const performImdbUpdate = async (
    imdbIdValue: string | undefined,
    options: {fetchTmdbData?: boolean} = {},
  ) => {
    const token = globalThis.localStorage?.getItem('adminToken');
    if (!token) {
      globalThis.location.href = '/admin/login';
      return false;
    }

    const body = {
      imdbId: imdbIdValue,
      fetchTmdbData: Boolean(options.fetchTmdbData),
      refreshData: Boolean(options.fetchTmdbData),
    };

    try {
      const response = await fetch(
        `${apiUrl}/admin/movies/${movieId}/imdb-id`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
      );

      if (response.status === 401) {
        globalThis.localStorage?.removeItem('adminToken');
        globalThis.location.href = '/admin/login';
        return false;
      }

      if (!response.ok) {
        const errorData = (await response
          .json()
          .catch(() => ({error: 'Unknown error'}))) as {error?: string};
        throw new Error(errorData.error || 'Failed to update IMDb ID');
      }

      const movieResponse = await fetch(
        `${apiUrl}/admin/movies/${movieId}`,
        {
          headers: {Authorization: `Bearer ${token}`},
        },
      );

      if (movieResponse.ok) {
        const data = (await movieResponse.json()) as MovieDetails;
        onMovieDataUpdate(data);
      }

      return true;
    } catch (error) {
      throw error instanceof Error
        ? error
        : new Error('Failed to update IMDb ID');
    }
  };

  const performTmdbUpdate = async (
    tmdbIdValue: number | undefined,
    options: {refreshData?: boolean} = {},
  ) => {
    const token = globalThis.localStorage?.getItem('adminToken');
    if (!token) {
      globalThis.location.href = '/admin/login';
      return false;
    }

    const body = {
      tmdbId: tmdbIdValue,
      refreshData: Boolean(options.refreshData),
    };

    try {
      const response = await fetch(
        `${apiUrl}/admin/movies/${movieId}/tmdb-id`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
      );

      if (response.status === 401) {
        globalThis.localStorage?.removeItem('adminToken');
        globalThis.location.href = '/admin/login';
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

      const movieResponse = await fetch(
        `${apiUrl}/admin/movies/${movieId}`,
        {
          headers: {Authorization: `Bearer ${token}`},
        },
      );

      if (movieResponse.ok) {
        const data = (await movieResponse.json()) as MovieDetails;
        onMovieDataUpdate(data);
      }

      return true;
    } catch (error) {
      throw error instanceof Error
        ? error
        : new Error('Failed to update TMDb ID');
    }
  };

  const updateImdbId = async () => {
    const imdbIdValue = newImdbId.trim() ? newImdbId.trim() : undefined;

    try {
      const success = await performImdbUpdate(imdbIdValue, {
        fetchTmdbData,
      });

      if (!success) {
        return;
      }

      setEditingImdbId(false);
      setNewImdbId('');
      setImdbError(undefined);
      setFetchTmdbData(false);

      globalThis.alert?.('IMDb IDを更新しました');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to update IMDb ID';
      setImdbError(message);
      console.error('Update IMDb ID error:', error);
    }
  };

  const updateTmdbId = async () => {
    const tmdbIdNumber = newTmdbId.trim()
      ? Number.parseInt(newTmdbId.trim(), 10)
      : undefined;

    if (
      newTmdbId.trim() &&
      (tmdbIdNumber === undefined ||
        Number.isNaN(tmdbIdNumber) ||
        tmdbIdNumber <= 0)
    ) {
      setTmdbError('TMDb IDは正の整数である必要があります');
      return;
    }

    try {
      const success = await performTmdbUpdate(tmdbIdNumber);

      if (!success) {
        return;
      }

      setEditingTmdbId(false);
      setNewTmdbId('');
      setTmdbError(undefined);

      globalThis.alert?.('TMDb IDを更新しました');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to update TMDb ID';
      setTmdbError(message);
      console.error('Update TMDb ID error:', error);
    }
  };

  const searchExternalIds = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();

    const trimmedQuery = idSearchQuery.trim();
    if (!trimmedQuery) {
      setIdSearchError('検索キーワードを入力してください');
      setIdSearchResults([]);
      return;
    }

    const params = new URLSearchParams();
    params.set('query', trimmedQuery);
    params.set('language', idSearchLanguage);
    params.set('limit', '5');

    if (idSearchYear.trim()) {
      const parsedYear = Number.parseInt(idSearchYear.trim(), 10);
      if (Number.isNaN(parsedYear)) {
        setIdSearchError('年は数値で入力してください');
        return;
      }

      params.set('year', String(parsedYear));
    }

    const token = globalThis.localStorage?.getItem('adminToken');
    if (!token) {
      globalThis.location.href = '/admin/login';
      return;
    }

    setSearchingIds(true);
    setIdSearchError(undefined);
    setIdSearchResults([]);
    setIdSearchUsedQuery(undefined);
    setIdSearchUsedYear(undefined);

    try {
      const response = await fetch(
        `${apiUrl}/admin/movies/${movieId}/external-id-search?${params.toString()}`,
        {
          headers: {Authorization: `Bearer ${token}`},
        },
      );

      if (response.status === 401) {
        globalThis.localStorage?.removeItem('adminToken');
        globalThis.location.href = '/admin/login';
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

      setImdbError(undefined);
      setIdSearchError(undefined);
      globalThis.alert?.('IMDb IDを設定しました');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'IMDb IDの設定に失敗しました';
      setIdSearchError(message);
      console.error('Apply IMDb ID error:', error);
    }
  };

  const applyTmdbIdFromSuggestion = async (
    suggestion: ExternalIdSuggestion,
    options: {refreshData?: boolean} = {},
  ) => {
    try {
      const success = await performTmdbUpdate(
        suggestion.tmdbId,
        options,
      );

      if (!success) {
        return;
      }

      setTmdbError(undefined);
      setIdSearchError(undefined);
      globalThis.alert?.('TMDb IDを設定しました');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'TMDb IDの設定に失敗しました';
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

      setImdbError(undefined);
      setTmdbError(undefined);
      setIdSearchError(undefined);
      globalThis.alert?.('IMDb/TMDb IDを設定しました');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'IDの設定に失敗しました';
      setIdSearchError(message);
      console.error('Apply both IDs error:', error);
    }
  };

  const refreshTMDbData = async () => {
    if (!movieData?.tmdbId) {
      setTmdbRefreshError('TMDb IDが設定されていません');
      return;
    }

    const token = globalThis.localStorage?.getItem('adminToken');
    if (!token) {
      globalThis.location.href = '/admin/login';
      return;
    }

    setTmdbRefreshing(true);
    setTmdbRefreshError(undefined);

    try {
      const response = await fetch(
        `${apiUrl}/admin/movies/${movieId}/refresh-tmdb`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (response.status === 401) {
        globalThis.localStorage?.removeItem('adminToken');
        globalThis.location.href = '/admin/login';
        return;
      }

      if (!response.ok) {
        const errorData = (await response
          .json()
          .catch(() => ({error: 'Unknown error'}))) as {error?: string};
        throw new Error(errorData.error || 'Failed to refresh TMDb data');
      }

      const movieResponse = await fetch(`${apiUrl}/admin/movies/${movieId}`, {
        headers: {Authorization: `Bearer ${token}`},
      });

      if (movieResponse.ok) {
        const data = (await movieResponse.json()) as MovieDetails;
        onMovieDataUpdate(data);
      }

      globalThis.alert?.('TMDb情報を更新しました');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to refresh TMDb data';
      setTmdbRefreshError(message);
      console.error('Refresh TMDb data error:', error);
    } finally {
      setTmdbRefreshing(false);
    }
  };

  const autoFetchTMDbData = async () => {
    if (!movieData?.imdbId) {
      setAutoFetchError('IMDb IDが設定されていません');
      return;
    }

    const token = globalThis.localStorage?.getItem('adminToken');
    if (!token) {
      globalThis.location.href = '/admin/login';
      return;
    }

    setAutoFetching(true);
    setAutoFetchError(undefined);

    try {
      const response = await fetch(
        `${apiUrl}/admin/movies/${movieId}/auto-fetch-tmdb`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (response.status === 401) {
        globalThis.localStorage?.removeItem('adminToken');
        globalThis.location.href = '/admin/login';
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

      const movieResponse = await fetch(`${apiUrl}/admin/movies/${movieId}`, {
        headers: {Authorization: `Bearer ${token}`},
      });

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
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">映画情報</h3>

      <div className="space-y-6">
        <div>
          <strong className="text-gray-700">映画ID:</strong> {movieData.uid}
        </div>

        {/* 公開年 */}
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
                <span>{movieData.year || '未設定'}</span>
                <button
                  type="button"
                  onClick={() => {
                    setEditingYear(true);
                    setNewYear(movieData.year?.toString() || '');
                  }}
                  className="text-blue-600 hover:text-blue-800 text-sm">
                  編集
                </button>
              </div>
            )}
          </div>
          {yearError && <p className="text-red-600 text-sm">{yearError}</p>}
        </div>

        <div>
          <strong className="text-gray-700">原語:</strong>{' '}
          {movieData.originalLanguage}
        </div>

        {/* IMDb ID */}
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
                    setImdbError(undefined);
                    setFetchTmdbData(false);
                  }}
                  className="bg-gray-500 text-white px-2 py-1 rounded text-xs hover:bg-gray-600">
                  キャンセル
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <span>{movieData.imdbId || '未設定'}</span>
                <button
                  type="button"
                  onClick={() => {
                    setEditingImdbId(true);
                    setNewImdbId(movieData.imdbId || '');
                  }}
                  className="text-blue-600 hover:text-blue-800 text-sm">
                  編集
                </button>
              </div>
            )}
          </div>
          {imdbError && <p className="text-red-600 text-sm">{imdbError}</p>}
        </div>

        {/* TMDb ID */}
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
                    setTmdbError(undefined);
                  }}
                  className="bg-gray-500 text-white px-2 py-1 rounded text-xs hover:bg-gray-600">
                  キャンセル
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <span>{movieData.tmdbId || '未設定'}</span>
                <button
                  type="button"
                  onClick={() => {
                    setEditingTmdbId(true);
                    setNewTmdbId(movieData.tmdbId?.toString() || '');
                  }}
                  className="text-blue-600 hover:text-blue-800 text-sm">
                  編集
                </button>
                {movieData.tmdbId && (
                  <button
                    type="button"
                    onClick={refreshTMDbData}
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

        {/* 外部ID検索 */}
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    検索キーワード
                  </label>
                  <input
                    type="text"
                    value={idSearchQuery}
                    onChange={event => {
                      setIdSearchQuery(event.target.value);
                    }}
                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                    placeholder="作品名"
                  />
                </div>
                <div className="md:col-span-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    検索言語
                  </label>
                  <select
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    公開年 (任意)
                  </label>
                  <input
                    type="number"
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
                      setIdSearchYear(
                        movieData.year ? String(movieData.year) : '',
                      );
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
                    {idSearchUsedYear !== undefined && !Number.isNaN(idSearchUsedYear) && (
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

              {!searchingIds &&
                idSearchResults.length === 0 &&
                !idSearchError && (
                  <p className="text-sm text-gray-600">
                    キーワードを入力して「検索」を押すと候補が表示されます。
                  </p>
                )}
            </div>
          )}
        </div>

        {/* IMDB_IDからTMDb自動取得ボタン */}
        {movieData.imdbId && (
          <div className="border-t pt-4">
            <div className="flex items-center space-x-2 mb-2">
              <strong className="text-gray-700">TMDb自動取得:</strong>
              <button
                type="button"
                onClick={autoFetchTMDbData}
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

        {/* TMDb自動取得エラー */}
        {autoFetchError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded text-red-600">
            {autoFetchError}
          </div>
        )}

        {/* TMDb更新エラー */}
        {tmdbRefreshError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded text-red-600">
            {tmdbRefreshError}
          </div>
        )}
      </div>
    </div>
  );
}
