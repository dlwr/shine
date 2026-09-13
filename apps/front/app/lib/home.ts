import type {FilmCardMovie} from '@/components/editorial/film-card';
import type {MonthlyPickMovie} from '@/components/editorial/monthly-pick';
import {resolveMovieTitle} from './movie-title';

export type HighlightedMovies = {
  daily?: FilmCardMovie;
  weekly?: FilmCardMovie;
  monthly?: MonthlyPickMovie;
};

export type PeriodType = keyof HighlightedMovies;

export type SearchMovie = {
  uid: string;
  title?: string;
  year?: number;
  translations?: Array<{
    languageCode: string;
    content: string;
    isDefault: number;
  }>;
};

export function createSelectionCacheKey() {
  const now = new Date();

  if (now.getHours() < 6) {
    now.setDate(now.getDate() - 1);
  }

  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();

  return `${year}-${month}-${day}`;
}

export function getLocalizedMovieTitle(movie: SearchMovie, locale: string) {
  return resolveMovieTitle(movie, {
    locale,
    fallback: locale === 'ja' ? 'タイトル不明' : 'Untitled',
  });
}

export function buildSelectionPath(locale: string) {
  return `/?cache=${createSelectionCacheKey()}&locale=${locale}`;
}

export function selectionRequestHeaders(locale: string) {
  return {
    'Cache-Control': 'no-store',
    'Accept-Language': locale === 'ja' ? 'ja,en;q=0.5' : 'en',
  };
}

export async function fetchHighlightedMovies(
  apiUrl: string,
  locale: string,
): Promise<HighlightedMovies> {
  const response = await fetch(`${apiUrl}${buildSelectionPath(locale)}`, {
    headers: selectionRequestHeaders(locale),
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return (await response.json()) as HighlightedMovies;
}
