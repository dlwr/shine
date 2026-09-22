import type {
  AdminMovieListItemData,
  AdminMoviesListData,
  CreateMovieData,
} from '@/lib/api-types';

export type Movie = AdminMovieListItemData;
export type PaginationData = AdminMoviesListData['pagination'];
export type MoviesResponse = AdminMoviesListData;

export type CreateMovieResponse = CreateMovieData | {error: string};
