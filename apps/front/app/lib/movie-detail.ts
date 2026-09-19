import type {ArticleLink} from '@/components/editorial/article-links-section';
import type {MovieCredits} from '@/components/editorial/credits-list';
import {
  apiFetch,
  resolveApiUrl,
  resolveEnvironment,
  type LoadContext,
} from './api';
import {getLocaleFromRequest, type Locale} from './locale';

export type MovieDetailData = {
  uid: string;
  year: number;
  originalLanguage: string;
  imdbId: string;
  tmdbId: number;
  imdbUrl?: string;
  posterUrl?: string;
  title: string;
  description?: string;
  nominations: Array<{
    uid: string;
    isWinner: boolean;
    specialMention?: string;
    person?: {uid: string; name: string};
    category: {
      uid: string;
      name: string;
      displayName?: string;
    };
    ceremony: {
      uid: string;
      number?: number;
      year: number;
    };
    organization: {
      uid: string;
      name: string;
      shortName?: string;
      displayName?: string;
    };
  }>;
  articleLinks: ArticleLink[];
  availability?: Array<{
    source: string;
    detail?: string;
    checkedAt: number;
  }>;
  credits?: MovieCredits;
};

export type LoaderErrorResponse = {
  error: string;
  status?: number;
  locale: Locale;
};

export type RelatedMovie = {
  uid: string;
  title: string;
  year?: number;
  posterUrl?: string;
};

export type LoaderSuccessResponse = {
  movieDetail: MovieDetailData;
  relatedMovies?: RelatedMovie[];
  turnstileSiteKey?: string;
  locale: Locale;
  apiUrl?: string;
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
    const response = await apiFetch(
      context,
      `/movies/${movieId}/related?locale=${locale}&limit=6`,
      {signal},
    );

    if (!response?.ok) {
      return [];
    }

    const body = (await response.json()) as {movies?: RelatedMovie[]};
    return body.movies ?? [];
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
    const [response, relatedMovies] = await Promise.all([
      apiFetch(context, `/movies/${movieId}`, {
        signal: request.signal,
      }),
      fetchRelatedMovies(context, movieId, locale, request.signal),
    ]);

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
    return {movieDetail, relatedMovies, turnstileSiteKey, locale, apiUrl};
  } catch {
    return {
      error: 'APIへの接続に失敗しました',
      status: 500,
      locale,
    };
  }
}
