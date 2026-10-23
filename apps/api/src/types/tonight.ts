import type {AwardLegend, AwardTaggedMovie} from './award-tagged-movies';

export type TonightPick = {
  movie: AwardTaggedMovie;
  awards: AwardLegend[];
  poolSize: number;
  maxRuntime: number;
};
