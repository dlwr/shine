import {useEffect, useState} from 'react';
import type {FormEvent} from 'react';
import {adminFetch, getAdminToken, readErrorMessage} from '@/lib/admin-fetch';
import type {
  ExternalIdSearchResponse,
  ExternalIdSuggestion,
  MovieDetails,
} from '../types';
import {preferredSearchFor, type SearchLanguage} from './preferred-search';

export function useExternalIdSearch({
  apiUrl,
  movieId,
  movieData,
}: {
  apiUrl: string;
  movieId: string;
  movieData: MovieDetails;
}) {
  const preferred = preferredSearchFor(movieData.translations);
  const preferredYear = movieData.year ? String(movieData.year) : '';

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [language, setLanguage] = useState<SearchLanguage>('ja-JP');
  const [year, setYear] = useState('');
  const [results, setResults] = useState<ExternalIdSuggestion[]>([]);
  const [error, setError] = useState<string | undefined>();
  const [searching, setSearching] = useState(false);
  const [usedQuery, setUsedQuery] = useState<string | undefined>();
  const [usedYear, setUsedYear] = useState<number | undefined>();
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!open && !movieData.imdbId && !movieData.tmdbId) {
      setOpen(true);
    }
  }, [movieData.imdbId, movieData.tmdbId, open]);

  useEffect(() => {
    setResults([]);
    setError(undefined);
    setInitialized(false);
  }, [movieData.uid]);

  useEffect(() => {
    if (!open || initialized) {
      return;
    }

    if (preferred.text) {
      setQuery(preferred.text);
      setLanguage(preferred.language);
    }

    setYear(preferredYear);
    setInitialized(true);
  }, [open, initialized, preferred.text, preferred.language, preferredYear]);

  const reset = () => {
    setQuery(preferred.text);
    setLanguage(preferred.language);
    setYear(preferredYear);
    setResults([]);
    setError(undefined);
    setUsedQuery(undefined);
    setUsedYear(undefined);
  };

  const search = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();

    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      setError('検索キーワードを入力してください');
      setResults([]);
      return;
    }

    const parameters = new URLSearchParams();
    parameters.set('query', trimmedQuery);
    parameters.set('language', language);
    parameters.set('limit', '5');

    if (year.trim()) {
      const parsedYear = Number(year.trim());
      if (Number.isNaN(parsedYear)) {
        setError('年は数値で入力してください');
        return;
      }

      parameters.set('year', String(parsedYear));
    }

    if (!getAdminToken()) {
      location.assign('/admin/login');
      return;
    }

    setSearching(true);
    setError(undefined);
    setResults([]);
    setUsedQuery(undefined);
    setUsedYear(undefined);

    try {
      const response = await adminFetch(
        `${apiUrl}/admin/movies/${movieId}/external-id-search?${parameters.toString()}`,
      );

      if (response.status === 401) {
        return;
      }

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, '検索に失敗しました'));
      }

      const data = (await response.json()) as ExternalIdSearchResponse;
      setResults(data.results);
      setUsedQuery(data.usedQuery);
      setUsedYear(data.usedYear);

      if (data.results.length === 0) {
        setError('該当する候補が見つかりませんでした');
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '検索に失敗しました';
      setResults([]);
      setError(message);
      console.error('External ID search error:', error);
    } finally {
      setSearching(false);
    }
  };

  return {
    open,
    toggleOpen: () => {
      setOpen(previous => !previous);
    },
    query,
    setQuery,
    language,
    setLanguage,
    year,
    setYear,
    results,
    error,
    setError,
    searching,
    usedQuery,
    usedYear,
    search,
    reset,
  };
}
