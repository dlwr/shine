import {setTimeout as sleep} from 'node:timers/promises';
import {and, eq, isNull, notInArray, sql} from 'drizzle-orm';
import {getDatabase, type Environment} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {posterUrls} from '@shine/database/schema/poster-urls';
import {
  fetchTMDBConfiguration as fetchTMDBConfig,
  fetchTMDBMovieDetails,
  findTMDBByImdbId,
} from './common/tmdb-utilities';
import {fetchJsonWithRetry} from './common/fetch-utilities';

const TMDB_API_BASE_URL = 'https://api.themoviedb.org/3';
const POSTER_SIZE = 'w500';
const MAX_YEAR_DISTANCE = 3;

export type BackfillStats = {
  candidates: number;
  postersSaved: number;
  noPosterOnTmdb: number;
  unresolved: number;
  tmdbIdTaken: number;
  failed: number;
};

type SearchResult = {
  id: number;
  title: string;
  original_title?: string;
  release_date: string;
};

export function normalizeTitle(title: string): string {
  return title
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036F]/g, '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9\u3040-\u30FF\u4E00-\u9FFF]/g, '');
}

/**
 * タイトルが正規化して完全一致し、かつ公開年が近い候補だけを採用する。
 * DBのyearは映画祭の開催年で、TMDbの公開年と数年ずれることがある
 */
export function pickStrictMatch(
  results: SearchResult[],
  title: string,
  year: number,
): number | undefined {
  const wanted = normalizeTitle(title);
  let best: {id: number; distance: number} | undefined;

  for (const result of results) {
    if (!result.release_date) {
      continue;
    }

    const resultYear = Number.parseInt(result.release_date.slice(0, 4), 10);
    if (!Number.isFinite(resultYear)) {
      continue;
    }

    const distance = Math.abs(resultYear - year);
    if (distance > MAX_YEAR_DISTANCE) {
      continue;
    }

    const titles = [result.title, result.original_title].filter(
      (value): value is string => typeof value === 'string',
    );
    if (titles.every(candidate => normalizeTitle(candidate) !== wanted)) {
      continue;
    }

    if (!best || distance < best.distance) {
      best = {id: result.id, distance};
    }
  }

  return best?.id;
}

type Candidate = {
  uid: string;
  imdbId: string | null;
  tmdbId: number | null;
  year: number | null;
  title: string | null;
};

export async function backfillPosters({
  environment,
  dryRun = false,
  limit,
  throttleMs = 300,
}: {
  environment: Environment;
  dryRun?: boolean;
  limit?: number;
  throttleMs?: number;
}): Promise<BackfillStats> {
  const stats: BackfillStats = {
    candidates: 0,
    postersSaved: 0,
    noPosterOnTmdb: 0,
    unresolved: 0,
    tmdbIdTaken: 0,
    failed: 0,
  };

  const tmdbApiKey = environment.TMDB_API_KEY;
  if (!tmdbApiKey) {
    throw new Error('TMDB_API_KEY is required to backfill posters.');
  }

  const database = getDatabase(environment);
  const withPoster = database
    .select({movieUid: posterUrls.movieUid})
    .from(posterUrls);

  const rows = await database
    .select({
      uid: movies.uid,
      imdbId: movies.imdbId,
      tmdbId: movies.tmdbId,
      year: movies.year,
      title: sql<string | null>`(
        SELECT content FROM translations
        WHERE translations.resource_uid = movies.uid
          AND translations.resource_type = 'movie_title'
        ORDER BY translations.is_default DESC
        LIMIT 1
      )`.as('title'),
    })
    .from(movies)
    .where(and(isNull(movies.deletedAt), notInArray(movies.uid, withPoster)));

  const candidates = limit === undefined ? rows : rows.slice(0, limit);
  stats.candidates = candidates.length;

  if (candidates.length === 0) {
    console.log('No movies need a poster.');
    return stats;
  }

  console.log(
    `${dryRun ? '[DRY RUN] ' : ''}Backfilling posters for ${candidates.length} movies...`,
  );

  const config = await fetchTMDBConfig(tmdbApiKey);
  const size = config.images.poster_sizes.includes(POSTER_SIZE)
    ? POSTER_SIZE
    : 'original';

  for (const candidate of candidates) {
    try {
      await processCandidate({
        database,
        candidate,
        tmdbApiKey,
        baseUrl: config.images.secure_base_url,
        size,
        dryRun,
        stats,
      });
    } catch (error) {
      console.error(`  Failed for ${candidate.uid}:`, error);
      stats.failed++;
    }

    if (throttleMs > 0) {
      await sleep(throttleMs);
    }
  }

  console.log('\nBackfill summary:');
  console.log(`  Candidates: ${stats.candidates}`);
  console.log(`  Posters saved: ${stats.postersSaved}`);
  console.log(`  No poster on TMDb: ${stats.noPosterOnTmdb}`);
  console.log(`  Unresolved: ${stats.unresolved}`);
  console.log(`  TMDb ID already taken: ${stats.tmdbIdTaken}`);
  console.log(`  Failed: ${stats.failed}`);

  return stats;
}

type DatabaseClient = ReturnType<typeof getDatabase>;

async function processCandidate({
  database,
  candidate,
  tmdbApiKey,
  baseUrl,
  size,
  dryRun,
  stats,
}: {
  database: DatabaseClient;
  candidate: Candidate;
  tmdbApiKey: string;
  baseUrl: string;
  size: string;
  dryRun: boolean;
  stats: BackfillStats;
}): Promise<void> {
  const resolved = await resolveTmdbId(candidate, tmdbApiKey);
  if (resolved === undefined) {
    console.log(`  Unresolved: ${candidate.title ?? candidate.uid}`);
    stats.unresolved++;
    return;
  }

  if (
    resolved !== candidate.tmdbId &&
    (await isTmdbIdTaken(database, resolved, candidate.uid))
  ) {
    console.log(
      `  TMDb ${resolved} already used by another movie: ${candidate.title ?? candidate.uid}`,
    );
    stats.tmdbIdTaken++;
    return;
  }

  const details = await fetchTMDBMovieDetails(resolved, tmdbApiKey);
  if (!details?.poster_path) {
    console.log(`  No poster on TMDb: ${candidate.title ?? candidate.uid}`);
    stats.noPosterOnTmdb++;
    return;
  }

  const url = `${baseUrl}${size}${details.poster_path}`;
  console.log(`  ${candidate.title ?? candidate.uid} -> ${url}`);
  stats.postersSaved++;

  if (dryRun) {
    return;
  }

  if (resolved !== candidate.tmdbId) {
    await database
      .update(movies)
      .set({tmdbId: resolved})
      .where(eq(movies.uid, candidate.uid));
  }

  await database
    .insert(posterUrls)
    .values({
      movieUid: candidate.uid,
      url,
      sourceType: 'tmdb',
      isPrimary: 1,
    })
    .onConflictDoNothing();
}

async function resolveTmdbId(
  candidate: Candidate,
  tmdbApiKey: string,
): Promise<number | undefined> {
  if (candidate.tmdbId !== null) {
    return candidate.tmdbId;
  }

  if (candidate.imdbId) {
    const found = await findTMDBByImdbId(candidate.imdbId, tmdbApiKey);
    if (found?.mediaType === 'movie') {
      return found.tmdbId;
    }

    return undefined;
  }

  if (!candidate.title || candidate.year === null) {
    return undefined;
  }

  const searchUrl = new URL(`${TMDB_API_BASE_URL}/search/movie`);
  searchUrl.searchParams.set('api_key', tmdbApiKey);
  searchUrl.searchParams.set('query', candidate.title);
  searchUrl.searchParams.set('include_adult', 'false');

  try {
    const data = await fetchJsonWithRetry<{results: SearchResult[]}>(
      searchUrl.toString(),
    );
    return pickStrictMatch(data.results ?? [], candidate.title, candidate.year);
  } catch (error) {
    console.error(`  Search failed for ${candidate.title}:`, error);
    return undefined;
  }
}

async function isTmdbIdTaken(
  database: DatabaseClient,
  tmdbId: number,
  ownUid: string,
): Promise<boolean> {
  const [row] = await database
    .select({uid: movies.uid})
    .from(movies)
    .where(eq(movies.tmdbId, tmdbId))
    .limit(1);

  return row !== undefined && row.uid !== ownUid;
}
