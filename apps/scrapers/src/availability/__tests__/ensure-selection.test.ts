import {describe, expect, it, vi} from 'vitest';
import type {AvailabilityDecision, MovieToCheck} from '../checker';
import {ensureAvailableSelection} from '../ensure-selection';

type TestMovie = MovieToCheck & {displayTitle: string};

const movieCatalog: Record<string, TestMovie> = {};
for (let index = 1; index <= 12; index++) {
  movieCatalog[`movie-${index}`] = {
    uid: `movie-${index}`,
    titles: [`Movie ${index}`],
    displayTitle: `Movie ${index}`,
  };
}

const loadMovie = async (uid: string): Promise<TestMovie> => movieCatalog[uid];

function availabilityOf(available: boolean): AvailabilityDecision {
  return {
    available,
    results: [
      {
        source: 'tmdb',
        status: available ? 'ok' : 'ng',
        fromCache: false,
      },
    ],
  };
}

describe('ensureAvailableSelection', () => {
  it('keeps the initial movie when it is available', async () => {
    const check = vi.fn(async () => availabilityOf(true));
    const reselect = vi.fn();

    const summary = await ensureAvailableSelection({
      type: 'daily',
      initialMovieUid: 'movie-1',
      loadMovie,
      check,
      reselect,
    });

    expect(summary.finalMovie.uid).toBe('movie-1');
    expect(summary.exhausted).toBe(false);
    expect(summary.attempts).toHaveLength(1);
    expect(reselect).not.toHaveBeenCalled();
  });

  it('reselects until an available movie is found', async () => {
    const check = vi.fn(async (movie: MovieToCheck) =>
      availabilityOf(movie.uid === 'movie-3'),
    );
    const reselectQueue = ['movie-2', 'movie-3'];
    const reselect = vi.fn(async () => reselectQueue.shift()!);

    const summary = await ensureAvailableSelection({
      type: 'weekly',
      initialMovieUid: 'movie-1',
      loadMovie,
      check,
      reselect,
    });

    expect(summary.finalMovie.uid).toBe('movie-3');
    expect(summary.exhausted).toBe(false);
    expect(summary.attempts).toHaveLength(3);
    expect(summary.attempts.map(a => a.available)).toEqual([
      false,
      false,
      true,
    ]);
  });

  it('passes cumulative exclude lists to reselect', async () => {
    const check = vi.fn(async (movie: MovieToCheck) =>
      availabilityOf(movie.uid === 'movie-3'),
    );
    const reselectQueue = ['movie-2', 'movie-3'];
    const reselect = vi.fn(async () => reselectQueue.shift()!);

    await ensureAvailableSelection({
      type: 'daily',
      initialMovieUid: 'movie-1',
      loadMovie,
      check,
      reselect,
    });

    expect(reselect).toHaveBeenNthCalledWith(1, 'daily', ['movie-1']);
    expect(reselect).toHaveBeenNthCalledWith(2, 'daily', [
      'movie-1',
      'movie-2',
    ]);
  });

  it('gives up after maxAttempts and keeps the last candidate', async () => {
    const check = vi.fn(async () => availabilityOf(false));
    let counter = 1;
    const reselect = vi.fn(async () => {
      counter += 1;
      return `movie-${counter}`;
    });

    const summary = await ensureAvailableSelection({
      type: 'monthly',
      initialMovieUid: 'movie-1',
      loadMovie,
      check,
      reselect,
      maxAttempts: 10,
    });

    expect(summary.exhausted).toBe(true);
    expect(summary.attempts).toHaveLength(10);
    expect(summary.finalMovie.uid).toBe('movie-10');
    expect(reselect).toHaveBeenCalledTimes(9);
  });

  it('propagates Japanese-title info from the loaded movie to the attempt', async () => {
    const check = vi.fn(async () => availabilityOf(true));
    const summary = await ensureAvailableSelection({
      type: 'daily',
      initialMovieUid: 'movie-1',
      async loadMovie(uid) {
        return {
          ...movieCatalog[uid],
          fetchedJapaneseTitle: 'アモーレス・ペロス',
        };
      },
      check,
      reselect: vi.fn(),
    });

    expect(summary.attempts[0].fetchedJapaneseTitle).toBe('アモーレス・ペロス');
  });

  it('propagates japaneseTitleMissing to the attempt', async () => {
    const check = vi.fn(async () => availabilityOf(true));
    const summary = await ensureAvailableSelection({
      type: 'daily',
      initialMovieUid: 'movie-1',
      async loadMovie(uid) {
        return {...movieCatalog[uid], japaneseTitleMissing: true};
      },
      check,
      reselect: vi.fn(),
    });

    expect(summary.attempts[0].japaneseTitleMissing).toBe(true);
  });
});
