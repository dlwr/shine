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
