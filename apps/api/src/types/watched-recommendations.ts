import type {DoubleFeatureMovie} from './double-feature';

export type WatchedRecommendation = DoubleFeatureMovie & {reason: string};

export type WatchedRecommendationsResponse = {
  movies: WatchedRecommendation[];
};
