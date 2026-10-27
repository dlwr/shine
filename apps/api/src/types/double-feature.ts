export type DoubleFeatureConnectionKind = 'director' | 'cast' | 'category';

export type DoubleFeatureMovie = {
  uid: string;
  title: string;
  year: number | undefined;
  posterUrl: string;
};

export type DoubleFeature = {
  date: string;
  connection: {kind: DoubleFeatureConnectionKind; label: string};
  movies: [DoubleFeatureMovie, DoubleFeatureMovie];
};
