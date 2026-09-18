/**
 * TMDb API v3 の応答の形
 */
export type TMDBMediaType = 'movie' | 'tv';

export type TMDBMovieData = {
  id: number;
  title: string;
  original_title: string;
  original_language?: string;
  overview?: string;
  release_date: string;
  imdb_id?: string;
  poster_path?: string;
  translations?: {
    translations: Array<{
      iso_3166_1: string;
      iso_639_1: string;
      name: string;
      english_name: string;
      data: {
        title?: string;
        name?: string;
        overview?: string;
      };
    }>;
  };
};

export type TMDBTvData = {
  id: number;
  name: string;
  original_name: string;
  original_language?: string;
  overview?: string;
  first_air_date: string;
  imdb_id?: string;
  poster_path?: string;
};

export type TMDBCastCredit = {
  credit_id: string;
  id: number;
  name: string;
  original_name: string;
  character?: string;
  order: number;
  profile_path?: string | undefined;
};

export type TMDBCrewCredit = {
  credit_id: string;
  id: number;
  name: string;
  original_name: string;
  job: string;
  department: string;
  profile_path?: string | undefined;
};

export type TMDBCredits = {
  cast: TMDBCastCredit[];
  crew: TMDBCrewCredit[];
};

export type TMDBFindResponse = {
  movie_results: TMDBMovieData[];
  tv_results: TMDBTvData[];
};

export type TMDBFindResult = {
  tmdbId: number;
  mediaType: TMDBMediaType;
};

export type TMDBMovieImages = {
  id: number;
  posters: Array<{
    file_path: string;
    width: number;
    height: number;
    iso_639_1: string | undefined;
  }>;
};

export type TMDBSearchMovieResult = {
  id: number;
  title: string;
  original_title?: string;
  original_language?: string;
  release_date?: string;
  poster_path?: string;
  overview?: string;
  popularity?: number;
  vote_average?: number;
  vote_count?: number;
};

export type TMDBSearchResponse = {
  results: TMDBSearchMovieResult[];
};

export type TMDBMultiSearchResult = {
  id: number;
  media_type: string;
  name?: string;
  title?: string;
  original_name?: string;
  original_title?: string;
};

export type TMDBConfig = {
  images: {
    secure_base_url: string;
    poster_sizes: string[];
  };
};

export type TMDBTranslationsResponse = {
  id: number;
  translations: Array<{
    iso_3166_1: string;
    iso_639_1: string;
    name: string;
    english_name: string;
    data: {
      homepage: string;
      overview: string;
      runtime: number;
      tagline: string;
      title: string;
      name?: string;
    };
  }>;
};

export type TMDBPersonData = {
  id: number;
  name: string;
  profile_path?: string | null;
};

export type TMDBExternalIds = {
  imdb_id?: string | null;
};

export type TMDBMovieSummary = {
  imdbId?: string;
  originalLanguage?: string;
};
