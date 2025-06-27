import type { Environment } from "db";

export interface ServiceContext {
  env: Environment;
  database: ReturnType<typeof import("db").getDatabase>;
}

export interface PaginationOptions {
  page: number;
  limit: number;
}

export interface SearchOptions extends PaginationOptions {
  query?: string;
  year?: number;
  language?: string;
  hasAwards?: boolean;
}

export interface MovieSelection {
  uid: string;
  year: number;
  originalLanguage: string;
  imdbId: string | null;
  tmdbId: number | null;
  title: string;
  description: string | undefined;
  posterUrl: string | undefined;
  nominations: {
    uid: string;
    year: number;
    isWinner: boolean;
    category: string;
    organization: string;
    ceremony: string;
  }[];
}

export interface DateSeedOptions {
  locale: string;
  date?: Date;
}

export interface TMDBMovieData {
  title?: string;
  overview?: string;
  poster_path?: string;
  translations?: {
    translations: {
      iso_639_1: string;
      data?: {
        title?: string;
        overview?: string;
      };
    }[];
  };
}

export interface UpdateIMDBIdOptions {
  imdbId: string;
  fetchTMDBData?: boolean;
}

export interface MergeMoviesOptions {
  sourceMovieId: string;
  targetMovieId: string;
  preserveTranslations?: boolean;
  preservePosters?: boolean;
}
