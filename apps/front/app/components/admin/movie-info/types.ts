import type {AdminMovieDetailData, ExternalIdSearchData} from '@/lib/api-types';

export type MovieDetails = AdminMovieDetailData;

export type ExternalIdSearchResponse = ExternalIdSearchData;
export type ExternalIdSuggestion = ExternalIdSearchData['results'][number];

export type PerformImdbUpdate = (
  imdbIdValue: string | undefined,
  options?: {fetchTmdbData?: boolean},
) => Promise<boolean>;

export type PerformTmdbUpdate = (
  tmdbIdValue: number | undefined,
  options?: {refreshData?: boolean},
) => Promise<boolean>;
