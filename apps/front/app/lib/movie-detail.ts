import {
  apiFetch,
  resolveApiUrl,
  resolveEnvironment,
  tryApiJson,
  type LoadContext,
} from './api';
import {getLocaleFromRequest, type Locale} from './locale';
import {httpUrl} from './share-target';

export type {
  MovieDetailData,
  RelatedMovieData as RelatedMovie,
} from './api-types';
import type {
  ConnectHopsData,
  MovieDetailData,
  RelatedMovieData as RelatedMovie,
} from './api-types';

export type LoaderErrorResponse = {
  error: string;
  status?: number;
  locale: Locale;
};

export type LoaderSuccessResponse = {
  movieDetail: MovieDetailData;
  relatedMovies?: Promise<RelatedMovie[]>;
  hops?: Promise<ConnectHopsData['hops']>;
  turnstileSiteKey?: string;
  locale: Locale;
  apiUrl?: string;
  sharedLink?: string;
};

export type LoaderData = LoaderErrorResponse | LoaderSuccessResponse;

export function isLoaderError(data: LoaderData): data is LoaderErrorResponse {
  return 'error' in data;
}

export function isLoaderSuccess(
  data: LoaderData,
): data is LoaderSuccessResponse {
  return 'movieDetail' in data;
}

export async function fetchRelatedMovies(
  context: LoadContext,
  movieId: string,
  locale: Locale,
  signal?: AbortSignal,
): Promise<RelatedMovie[]> {
  try {
    const body = await tryApiJson<{movies?: RelatedMovie[]}>(
      context,
      `/movies/${movieId}/related?locale=${locale}&limit=6`,
      {signal},
    );
    return body?.movies ?? [];
  } catch {
    return [];
  }
}

async function fetchHops(
  context: LoadContext,
  movieId: string,
  signal?: AbortSignal,
): Promise<ConnectHopsData['hops']> {
  try {
    const body = await tryApiJson<ConnectHopsData>(
      context,
      `/connect/hops?from=${encodeURIComponent(movieId)}`,
      {signal},
    );
    return body?.hops ?? [];
  } catch {
    return [];
  }
}

export async function loadMovieDetail(
  context: LoadContext,
  movieId: string,
  request: Request,
): Promise<LoaderData> {
  const locale = getLocaleFromRequest(request);

  try {
    const environment = resolveEnvironment(context);
    const apiUrl = resolveApiUrl(context);
    const detailResponse = apiFetch(context, `/movies/${movieId}`, {
      signal: request.signal,
    });
    const relatedMovies = fetchRelatedMovies(
      context,
      movieId,
      locale,
      request.signal,
    );
    const hops = fetchHops(context, movieId, request.signal);
    const response = await detailResponse;

    if (response.status === 404) {
      return {
        error: '映画が見つかりませんでした',
        status: 404,
        locale,
      };
    }

    if (!response.ok) {
      return {
        error: 'データの取得に失敗しました',
        status: response.status,
        locale,
      };
    }

    const movieDetail = (await response.json()) as MovieDetailData;
    const turnstileSiteKey = environment.PUBLIC_TURNSTILE_SITE_KEY;
    const sharedLink = httpUrl(
      new URL(request.url).searchParams.get('link') ?? undefined,
    );
    return {
      movieDetail,
      relatedMovies,
      hops,
      turnstileSiteKey,
      locale,
      apiUrl,
      sharedLink,
    };
  } catch {
    return {
      error: 'APIへの接続に失敗しました',
      status: 500,
      locale,
    };
  }
}
