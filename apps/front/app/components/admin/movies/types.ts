export type Movie = {
  uid: string;
  title: string;
  year: number | undefined;
  originalLanguage: string | undefined;
  posterUrl: string | undefined;
  imdbUrl?: string;
  mediaType?: 'movie' | 'tv';
};

export type PaginationData = {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
};

export type MoviesResponse = {
  movies: Movie[];
  pagination: PaginationData;
};

export type CreateMovieResponse = {
  success?: boolean;
  movie?: {
    uid: string;
    imdbId?: string | null;
    tmdbId?: number | null;
    year?: number | null;
    originalLanguage?: string | null;
  };
  imports?: {
    translationsAdded: number;
    postersAdded: number;
  };
  error?: string;
};
