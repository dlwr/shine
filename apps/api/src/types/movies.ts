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
    person?: {uid: string; name: string} | undefined;
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
    url?: string;
    title?: string;
    description?: string;
  }>;
  availability?: Array<{
    source: string;
    detail: string | undefined;
    checkedAt: number;
  }>;
  watchedCount?: number;
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

export type DateSeedOptions = {
  locale: string;
  date?: Date;
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
