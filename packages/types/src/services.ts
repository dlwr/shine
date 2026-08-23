import type {Environment, getDatabase} from '@shine/database';

export type ServiceContext = {
  env: Environment;
  database: ReturnType<typeof getDatabase>;
};

export type PaginationOptions = {
  page: number;
  limit: number;
};

export type SearchOptions = {
  query?: string;
  year?: number;
  language?: string;
  hasAwards?: boolean;
} & PaginationOptions;

export type MovieSelection = {
  uid: string;
  year: number;
  originalLanguage: string;
  imdbId: string | undefined;
  tmdbId: number | undefined;
  title: string;
  description: string | undefined;
  posterUrl?: string | undefined;
  posterUrls?: Array<{
    url: string;
    languageCode: string | undefined;
    isPrimary: number;
  }>;
  imdbUrl: string | undefined;
  nominations: Array<{
    uid: string;
    isWinner: boolean;
    specialMention?: string | undefined;
    category: {
      uid: string;
      name: string;
      displayName?: string | undefined;
    };
    ceremony: {
      uid: string;
      number: number | undefined;
      year: number;
    };
    organization: {
      uid: string;
      name: string;
      shortName: string | undefined;
      displayName?: string | undefined;
      slug: string | undefined;
      hasYearPages: boolean;
    };
  }>;
  articleLinks: Array<{
    uid: string;
    url: string;
    title: string;
    description?: string;
  }>;
  availability?: Array<{
    source: string;
    detail: string | undefined;
    checkedAt: number;
  }>;
  credits?: {
    cast: Array<{
      uid: string;
      name: string;
      character: string | undefined;
      profilePath: string | undefined;
    }>;
    crew: Array<{
      uid: string;
      name: string;
      job: string;
      profilePath: string | undefined;
    }>;
  };
};

export type AwardMovieEntry = {
  uid: string;
  title: string | undefined;
  movieYear: number | undefined;
  posterUrl: string | undefined;
  isWinner: boolean;
  /** ランキング形式の賞で「N位」が入る */
  specialMention?: string;
};

export type AwardYearGroup = {
  year: number;
  ceremonyNumber: number | undefined;
  /** その回の全出品作数。moviesは年別グルーピングでは受賞作のみを含む */
  filmCount: number;
  movies: AwardMovieEntry[];
};

export type AwardPagination = {
  page: number;
  perPage: number;
  totalCount: number;
  totalPages: number;
};

export type AwardDetail = {
  slug: string;
  name: string;
  organization: string;
  description: string;
  grouping: 'year' | 'list';
  years: AwardYearGroup[];
  /** grouping === 'list' のときのみ返る */
  pagination?: AwardPagination;
};

export type AwardYearDetail = {
  slug: string;
  name: string;
  organization: string;
  description: string;
  year: number;
  ceremonyNumber: number | undefined;
  movies: AwardMovieEntry[];
  previousYear: number | undefined;
  nextYear: number | undefined;
};

export type AwardSummary = {
  slug: string;
  name: string;
  organization: string;
  description: string;
  grouping: 'year' | 'list';
  movieCount: number;
  firstYear: number;
  lastYear: number;
};

export type CrossingMovie = {
  uid: string;
  title: string | undefined;
  year: number | undefined;
  posterUrl: string | undefined;
  awardSlugs: string[];
};

export type AwardCrossings = {
  awards: Array<{
    slug: string;
    name: string;
    shortLabel: string;
    organization: string;
    filmCount: number;
  }>;
  pairs: Array<{a: string; b: string; shared: number}>;
  distribution: Array<{awardCount: number; filmCount: number}>;
  topMovies: CrossingMovie[];
};

export type UncrownedLoss = {
  slug: string;
  year: number;
};

export type UncrownedMovie = {
  uid: string;
  title: string | undefined;
  year: number | undefined;
  posterUrl: string | undefined;
  losses: UncrownedLoss[];
};

export type Uncrowned = {
  nominatedFilmCount: number;
  uncrownedFilmCount: number;
  awards: Array<{
    slug: string;
    name: string;
    shortLabel: string;
    organization: string;
  }>;
  topMovies: UncrownedMovie[];
};

export type YearSummary = {
  year: number;
  movieCount: number;
  winnerCount: number;
};

export type YearMovie = {
  uid: string;
  title: string | undefined;
  posterUrl: string | undefined;
  isWinner: boolean;
  awards: Array<{slug: string; isWinner: boolean}>;
};

export type YearDetail = {
  year: number;
  movies: YearMovie[];
  awards: Array<{
    slug: string;
    shortLabel: string;
    name: string;
    organization: string;
  }>;
  previousYear: number | undefined;
  nextYear: number | undefined;
};

export type QuizHint = {
  label: string;
  value: string;
};

export type QuizCandidate = {
  uid: string;
  title: string;
  year: number | undefined;
};

export type QuizPuzzle = {
  date: string;
  maxAttempts: number;
  poolSize: number;
};

export type QuizAnswer = {
  uid: string;
  title: string;
  year: number | undefined;
  posterUrl: string;
  /** ポスターの拡大表示で中心に置く点。0〜1の相対座標 */
  focalX: number;
  focalY: number;
};

export type QuizGuessResult = {
  correct: boolean;
  hint?: QuizHint;
  answer?: QuizAnswer;
};

export type DateSeedOptions = {
  locale: string;
  date?: Date;
};

export type TMDBMovieData = {
  title?: string;
  original_title?: string;
  original_language?: string;
  overview?: string;
  poster_path?: string;
  translations?: {
    translations: Array<{
      iso_639_1: string;
      data?: {
        title?: string;
        overview?: string;
      };
    }>;
  };
};

export type UpdateIMDBIdOptions = {
  imdbId: string;
  fetchTMDBData?: boolean;
};

export type MergeMoviesOptions = {
  sourceMovieId: string;
  targetMovieId: string;
  preserveTranslations?: boolean;
  preservePosters?: boolean;
};

export type PersonDetail = {
  uid: string;
  name: string;
  originalName: string;
  profilePath: string | undefined;
  credits: Array<{
    movieUid: string;
    title: string | undefined;
    year: number | undefined;
    posterUrl: string | undefined;
    jobs: string[];
    character: string | undefined;
  }>;
};

export type PersonSummary = {
  uid: string;
  name: string;
  movieCount: number;
};

export type PeopleListResult = {
  people: PersonSummary[];
  pagination: AwardPagination;
};
