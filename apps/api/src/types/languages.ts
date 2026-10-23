import type {AwardLegend, AwardTaggedMovie} from './award-tagged-movies';

export type LanguageSummary = {code: string; movieCount: number};

export type LanguagePage = {
  code: string;
  movieCount: number;
  page: number;
  pageCount: number;
  movies: AwardTaggedMovie[];
  awards: AwardLegend[];
};
