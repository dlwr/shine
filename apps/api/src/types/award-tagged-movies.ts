export type AwardTaggedMovie = {
  uid: string;
  title: string | undefined;
  posterUrl: string | undefined;
  year: number | undefined;
  releaseDate: string | undefined;
  runtime: number | undefined;
  isWinner: boolean;
  awards: Array<{slug: string; isWinner: boolean}>;
};

export type AwardLegend = {
  slug: string;
  shortLabel: string;
  name: string;
  organization: string;
};
