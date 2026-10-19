import {inArray} from 'drizzle-orm';
import {movieAvailabilityChecks} from '@shine/database/schema/movie-availability-checks';
import {inChunks, type getDatabase} from '@shine/database';
import type {
  JapanAvailabilityStatus,
  WatchableAvailability,
} from '../types/common';
import {judgeJapanAvailability} from './japan-availability';

type Database = ReturnType<typeof getDatabase>;

const SOURCE_ORDER = ['tmdb', 'unext', 'discas', 'geo'];

export type MovieAvailability = {
  status: JapanAvailabilityStatus;
  watchable: WatchableAvailability[];
};

export async function loadMovieAvailabilityByMovie(
  database: Database,
  movieUids: string[],
): Promise<Map<string, MovieAvailability>> {
  if (movieUids.length === 0) {
    return new Map();
  }

  const rows = await inChunks(movieUids, chunk =>
    database
      .select({
        movieUid: movieAvailabilityChecks.movieUid,
        source: movieAvailabilityChecks.source,
        status: movieAvailabilityChecks.status,
        detail: movieAvailabilityChecks.detail,
        checkedAt: movieAvailabilityChecks.checkedAt,
      })
      .from(movieAvailabilityChecks)
      .where(inArray(movieAvailabilityChecks.movieUid, chunk))
      .orderBy(movieAvailabilityChecks.checkedAt),
  );

  type Row = (typeof rows)[number];
  const latestByMovie = new Map<string, Map<string, Row>>();
  for (const row of rows) {
    const latestBySource =
      latestByMovie.get(row.movieUid) ?? new Map<string, Row>();
    latestBySource.set(row.source, row);
    latestByMovie.set(row.movieUid, latestBySource);
  }

  const result = new Map<string, MovieAvailability>();
  for (const [movieUid, latestBySource] of latestByMovie) {
    const latest = SOURCE_ORDER.map(source =>
      latestBySource.get(source),
    ).filter((row): row is Row => row !== undefined);
    result.set(movieUid, {
      status: judgeJapanAvailability(latest),
      watchable: latest
        .filter(row => row.status === 'ok')
        .map(row => ({
          source: row.source,
          detail: row.detail ?? undefined,
          checkedAt: row.checkedAt,
        })),
    });
  }

  return result;
}

export function availabilityStatusOf(
  availabilityByMovie: Map<string, MovieAvailability>,
  movieUid: string,
): JapanAvailabilityStatus {
  return availabilityByMovie.get(movieUid)?.status ?? 'unchecked';
}

export async function loadWatchableAvailabilityByMovie(
  database: Database,
  movieUids: string[],
): Promise<Map<string, WatchableAvailability[]>> {
  const availabilityByMovie = await loadMovieAvailabilityByMovie(
    database,
    movieUids,
  );
  const watchable = new Map<string, WatchableAvailability[]>();
  for (const [movieUid, availability] of availabilityByMovie) {
    if (availability.watchable.length > 0) {
      watchable.set(movieUid, availability.watchable);
    }
  }

  return watchable;
}
