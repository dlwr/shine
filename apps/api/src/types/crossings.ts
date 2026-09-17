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

export type PersonCrossingPerformance = {
  person: {uid: string; name: string; profilePath: string | undefined};
  movie: {
    uid: string;
    title: string | undefined;
    year: number | undefined;
    posterUrl: string | undefined;
  };
  awards: Array<{slug: string; organization: string; category: string}>;
  organizationCount: number;
};

export type PersonCrossings = {
  organizations: Array<{
    key: string;
    name: string;
    shortLabel: string;
    performanceCount: number;
  }>;
  pairs: Array<{a: string; b: string; shared: number}>;
  distribution: Array<{organizationCount: number; performanceCount: number}>;
  topPerformances: PersonCrossingPerformance[];
};
