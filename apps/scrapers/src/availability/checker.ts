import {and, eq, getDatabase} from '@shine/database';
import {movieAvailabilityChecks} from '@shine/database/schema/movie-availability-checks';
import type {
  AvailabilitySource,
  AvailabilityStatus,
  SourceCheckResult,
} from './types';

const DAY_SECONDS = 24 * 60 * 60;
const OK_TTL_SECONDS = 7 * DAY_SECONDS;
const NG_TTL_SECONDS = 90 * DAY_SECONDS;

export type MovieToCheck = {
  uid: string;
  titles: string[];
  tmdbId?: number;
  imdbId?: string;
  year?: number;
};

export type SourceRunner = (movie: MovieToCheck) => Promise<SourceCheckResult>;

export type SourceRunners = Partial<Record<AvailabilitySource, SourceRunner>>;

export type AvailabilityDecision = {
  available: boolean;
  results: Array<SourceCheckResult & {fromCache: boolean}>;
};

type Database = ReturnType<typeof getDatabase>;

function isFresh(
  status: AvailabilityStatus,
  checkedAt: number,
  nowEpoch: number,
): boolean {
  if (status === 'ok') {
    return nowEpoch - checkedAt <= OK_TTL_SECONDS;
  }

  if (status === 'ng') {
    return nowEpoch - checkedAt <= NG_TTL_SECONDS;
  }

  return false;
}

async function loadFreshResult(
  database: Database,
  movieUid: string,
  source: AvailabilitySource,
  nowEpoch: number,
): Promise<SourceCheckResult | undefined> {
  const rows = await database
    .select({
      status: movieAvailabilityChecks.status,
      detail: movieAvailabilityChecks.detail,
      checkedAt: movieAvailabilityChecks.checkedAt,
    })
    .from(movieAvailabilityChecks)
    .where(
      and(
        eq(movieAvailabilityChecks.movieUid, movieUid),
        eq(movieAvailabilityChecks.source, source),
      ),
    )
    .orderBy(movieAvailabilityChecks.checkedAt);

  const latest = rows.at(-1);
  if (!latest || !isFresh(latest.status, latest.checkedAt, nowEpoch)) {
    return undefined;
  }

  return {source, status: latest.status, detail: latest.detail ?? undefined};
}

export async function checkMovieAvailability(
  database: Database,
  movie: MovieToCheck,
  options: {sourceRunners: SourceRunners; now?: Date},
): Promise<AvailabilityDecision> {
  const now = options.now ?? new Date();
  const nowEpoch = Math.floor(now.getTime() / 1000);
  const results: AvailabilityDecision['results'] = [];

  for (const [source, runner] of Object.entries(options.sourceRunners) as Array<
    [AvailabilitySource, SourceRunner]
  >) {
    const cached = await loadFreshResult(database, movie.uid, source, nowEpoch);
    if (cached) {
      results.push({...cached, fromCache: true});
      continue;
    }

    const result = await runner(movie);
    results.push({...result, fromCache: false});
    await database.insert(movieAvailabilityChecks).values({
      movieUid: movie.uid,
      source: result.source,
      status: result.status,
      detail: result.detail,
      checkedAt: nowEpoch,
    });
  }

  return {
    available: results.some(result => result.status === 'ok'),
    results,
  };
}
