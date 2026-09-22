import type {AwardSummary, WatchedList} from './awards';
import type {MovieSelection} from './movies';
import type {YearSummary} from './years';

/**
 * ルートが service の戻り値をそのまま返さず組み立てている応答の形。
 * front は `apps/front/app/lib/api-types.ts` からこの型を引く
 */

export type MovieDetail = Pick<
  MovieSelection,
  | 'uid'
  | 'year'
  | 'originalLanguage'
  | 'imdbId'
  | 'tmdbId'
  | 'imdbUrl'
  | 'posterUrl'
  | 'title'
  | 'description'
  | 'nominations'
  | 'articleLinks'
  | 'credits'
>;

type SearchedMovie = {
  uid: string;
  year: number | undefined;
  originalLanguage: string;
  imdbId: string | undefined;
  title: string;
  posterUrls: Array<{
    url: string;
    languageCode: string | undefined;
    isPrimary: number;
  }>;
  hasNominations: boolean;
};

export type MovieSearchResponse = {
  movies: SearchedMovie[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
  filters: {
    query: string | undefined;
    year: number | undefined;
    language: string | undefined;
    hasAwards: boolean | undefined;
  };
};

export type SelectionsResponse = {
  daily: MovieSelection;
  weekly: MovieSelection;
  monthly: MovieSelection;
};

export type QuizDailyResponse = {
  date: string;
  maxAttempts: number;
  poolSize: number;
};

export type AwardsListResponse = {awards: AwardSummary[]};
export type YearsListResponse = {years: YearSummary[]};
export type WatchedListsResponse = {lists: WatchedList[]};
export type MovieUidsResponse = {uids: string[]};
