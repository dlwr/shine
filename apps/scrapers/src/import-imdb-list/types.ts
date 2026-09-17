import {type getDatabase, type Environment} from '@shine/database';
import {type TMDBConfig} from '@shine/tmdb';

export type DatabaseClient = ReturnType<typeof getDatabase>;

export type CsvMovieRow = {
  Const: string;
  Title?: string;
  'Original Title'?: string;
  Year?: string;
  'Release Date'?: string;
  Description?: string;
};

export type TmdbMovieDetails = {
  id?: number;
  title: string;
  original_title: string;
  original_language?: string;
  release_date?: string;
  poster_path?: string;
  imdb_id?: string;
  overview?: string;
  localizedTitle?: string;
  localizedOverview?: string;
  media_type?: 'movie' | 'tv';
};

export type ImportStats = {
  skippedExisting: number;
  imported: number;
  notFound: number;
  failed: number;
  nominationsCreated: number;
};

export type ImportOptions = {
  filePath: string;
  environment: Environment;
  dryRun?: boolean;
  limit?: number;
  throttleMs?: number;
  organizationName?: string;
  categoryName?: string;
  ceremonyName?: string;
};

export type AwardContext = {
  organizationUid: string;
  ceremonyUid: string;
  categoryUid: string;
};

export type ExistingMovieRecord = {
  uid: string;
  imdbId: string;
  tmdbId?: number;
};

export type ImportRunContext = {
  database: DatabaseClient;
  tmdbApiKey: string;
  tmdbConfig: TMDBConfig;
  awardContext: AwardContext;
  dryRun: boolean;
  throttleMs: number;
  stats: ImportStats;
  existingByImdbId: Map<string, ExistingMovieRecord>;
  nominatedMovieUids: Set<string>;
};
