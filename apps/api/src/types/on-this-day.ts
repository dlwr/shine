export type OnThisDayMovie = {
  uid: string;
  title: string | undefined;
  posterUrl: string | undefined;
  releaseDate: string;
  isWinner: boolean;
  awards: Array<{slug: string; isWinner: boolean}>;
};

export type OnThisDay = {
  monthDay: string;
  movies: OnThisDayMovie[];
  awards: Array<{
    slug: string;
    shortLabel: string;
    name: string;
    organization: string;
  }>;
  people: Array<{uid: string; name: string; birthYear: number}>;
};
