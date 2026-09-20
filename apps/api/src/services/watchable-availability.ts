import {inArray} from 'drizzle-orm';
import {movieAvailabilityChecks} from '@shine/database/schema/movie-availability-checks';
import type {getDatabase} from '@shine/database';
import type {WatchableAvailability} from '../types/common';

type Database = ReturnType<typeof getDatabase>;

const SOURCE_ORDER = ['tmdb', 'unext', 'discas', 'geo'];

export async function loadWatchableAvailabilityByMovie(
  database: Database,
  movieUids: string[],
): Promise<Map<string, WatchableAvailability[]>> {
  if (movieUids.length === 0) {
    return new Map();
  }

  const rows = await database
    .select({
      movieUid: movieAvailabilityChecks.movieUid,
      source: movieAvailabilityChecks.source,
      status: movieAvailabilityChecks.status,
      detail: movieAvailabilityChecks.detail,
      checkedAt: movieAvailabilityChecks.checkedAt,
    })
    .from(movieAvailabilityChecks)
    .where(inArray(movieAvailabilityChecks.movieUid, movieUids))
    .orderBy(movieAvailabilityChecks.checkedAt);

  // Latest record per source; expose only sources currently judged watchable
  type Row = (typeof rows)[number];
  const latestByMovie = new Map<string, Map<string, Row>>();
  for (const row of rows) {
    const latestBySource =
      latestByMovie.get(row.movieUid) ?? new Map<string, Row>();
    latestBySource.set(row.source, row);
    latestByMovie.set(row.movieUid, latestBySource);
  }

  const watchable = new Map<string, WatchableAvailability[]>();
  for (const [movieUid, latestBySource] of latestByMovie) {
    const entries = SOURCE_ORDER.map(source => latestBySource.get(source))
      .filter((row): row is Row => row?.status === 'ok')
      .map(row => ({
        source: row.source,
        detail: row.detail ?? undefined,
        checkedAt: row.checkedAt,
      }));
    if (entries.length > 0) {
      watchable.set(movieUid, entries);
    }
  }

  return watchable;
}
