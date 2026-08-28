export type ProminentMovie = {
  uid: string;
  title?: string;
  year?: number;
};

export type ProminentPerson = {
  uid: string;
  name: string;
  originalName: string;
  profilePath?: string;
  wonCount: number;
  nominatedCount: number;
  topMovies: ProminentMovie[];
};
