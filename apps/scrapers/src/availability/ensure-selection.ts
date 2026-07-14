import type {AvailabilityDecision, MovieToCheck} from './checker';

export type SelectionType = 'daily' | 'weekly' | 'monthly';

export type LoadedMovie = MovieToCheck & {displayTitle: string};

export type SelectionAttempt = {
  movieUid: string;
  title: string;
  available: boolean;
  results: AvailabilityDecision['results'];
};

export type SelectionCheckSummary = {
  type: SelectionType;
  finalMovie: {uid: string; title: string};
  attempts: SelectionAttempt[];
  exhausted: boolean;
};

export async function ensureAvailableSelection(options: {
  type: SelectionType;
  initialMovieUid: string;
  loadMovie: (uid: string) => Promise<LoadedMovie>;
  check: (movie: LoadedMovie) => Promise<AvailabilityDecision>;
  reselect: (
    type: SelectionType,
    excludeMovieUids: string[],
  ) => Promise<string>;
  maxAttempts?: number;
}): Promise<SelectionCheckSummary> {
  const maxAttempts = options.maxAttempts ?? 10;
  const attempts: SelectionAttempt[] = [];
  const checkedUids: string[] = [];

  let currentUid = options.initialMovieUid;
  let currentMovie = await options.loadMovie(currentUid);

  for (;;) {
    const decision = await options.check(currentMovie);
    attempts.push({
      movieUid: currentUid,
      title: currentMovie.displayTitle,
      available: decision.available,
      results: decision.results,
    });
    checkedUids.push(currentUid);

    if (decision.available || attempts.length >= maxAttempts) {
      return {
        type: options.type,
        finalMovie: {uid: currentUid, title: currentMovie.displayTitle},
        attempts,
        exhausted: !decision.available,
      };
    }

    currentUid = await options.reselect(options.type, [...checkedUids]);
    currentMovie = await options.loadMovie(currentUid);
  }
}
