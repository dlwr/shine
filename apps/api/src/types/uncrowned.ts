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

export type UncrownedPersonLoss = {
  slug: string;
  year: number;
};

export type UncrownedPerson = {
  uid: string;
  name: string;
  profilePath: string | undefined;
  losses: UncrownedPersonLoss[];
};

export type PersonUncrowned = {
  nominatedPersonCount: number;
  uncrownedPersonCount: number;
  awards: Array<{
    slug: string;
    name: string;
    shortLabel: string;
    organization: string;
  }>;
  topPeople: UncrownedPerson[];
};
