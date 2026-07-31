export type MovieDetails = {
  uid: string;
  year: number;
  originalLanguage: string;
  imdbId: string | undefined;
  tmdbId: number | undefined;
  mediaType?: 'movie' | 'tv';
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

export type ExternalIdSuggestion = {
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

export type ExternalIdSearchResponse = {
  usedQuery: string;
  usedYear?: number;
  results: ExternalIdSuggestion[];
};

export type PerformImdbUpdate = (
  imdbIdValue: string | undefined,
  options?: {fetchTmdbData?: boolean},
) => Promise<boolean>;

export type PerformTmdbUpdate = (
  tmdbIdValue: number | undefined,
  options?: {refreshData?: boolean},
) => Promise<boolean>;
