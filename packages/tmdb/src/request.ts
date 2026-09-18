/**
 * TMDb API v3 への GET。404 だけ「見つからない」として区別し、
 * 401 やリトライを使い切った 429/5xx は投げる
 */
import {buildUrl, FetchHttpError, fetchJsonWithRetry} from '@shine/utils/fetch';

const TMDB_API_BASE_URL = 'https://api.themoviedb.org/3';

export async function tmdbGet<T>(
  path: string,
  tmdbApiKey: string,
  parameters: Record<string, string> = {},
): Promise<T> {
  const url = buildUrl(`${TMDB_API_BASE_URL}/${path}`, {
    api_key: tmdbApiKey,
    ...parameters,
  });
  return fetchJsonWithRetry<T>(url);
}

export function isTmdbNotFound(error: unknown): boolean {
  return error instanceof FetchHttpError && error.status === 404;
}

export async function tmdbGetUnlessNotFound<T>(
  path: string,
  tmdbApiKey: string,
  parameters: Record<string, string> = {},
): Promise<T | undefined> {
  try {
    return await tmdbGet<T>(path, tmdbApiKey, parameters);
  } catch (error) {
    if (isTmdbNotFound(error)) {
      return undefined;
    }

    throw error;
  }
}
