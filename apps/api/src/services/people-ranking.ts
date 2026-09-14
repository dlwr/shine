import {isNotNull, notInArray, sql, type getDatabase} from '@shine/database';
import {movieCredits} from '@shine/database/schema/movie-credits';
import {movies} from '@shine/database/schema/movies';
import {type EdgeCache} from '../utils/cache';

type Database = ReturnType<typeof getDatabase>;

type RankedPerson = {uid: string; movieCount: number};

type RankingSlice = {totalCount: number; rows: RankedPerson[]};

const CACHE_PREFIX = 'people:eligible:v2';
const CACHE_TTL = 604_800;
const CHUNK_SIZE = 500;

const movieCount = sql<number>`COUNT(DISTINCT ${movieCredits.movieUid})`;

export async function eligibleRankingSlice(
  database: Database,
  cache: EdgeCache | undefined,
  start: number,
  end: number,
): Promise<RankingSlice> {
  const cached = cache && (await cachedRankingSlice(cache, start, end));
  if (cached) {
    return cached;
  }

  const ranking = await computeRanking(database);
  if (cache) {
    await storeRanking(cache, ranking);
  }

  return {totalCount: ranking.length, rows: ranking.slice(start, end)};
}

async function cachedRankingSlice(
  cache: EdgeCache,
  start: number,
  end: number,
): Promise<RankingSlice | undefined> {
  const count = await cache.get(`${CACHE_PREFIX}:count`);
  if (typeof count?.data !== 'number') {
    return undefined;
  }

  const totalCount = count.data;
  if (start >= totalCount) {
    return {totalCount, rows: []};
  }

  const firstChunk = Math.floor(start / CHUNK_SIZE);
  const lastChunk = Math.floor((Math.min(end, totalCount) - 1) / CHUNK_SIZE);
  const chunks = await Promise.all(
    Array.from({length: lastChunk - firstChunk + 1}, (_, offset) =>
      cache.get(`${CACHE_PREFIX}:chunk:${firstChunk + offset}`),
    ),
  );
  if (chunks.some(chunk => !Array.isArray(chunk?.data))) {
    return undefined;
  }

  const rows = chunks.flatMap(chunk => chunk?.data as RankedPerson[]);
  const offset = firstChunk * CHUNK_SIZE;
  return {totalCount, rows: rows.slice(start - offset, end - offset)};
}

async function computeRanking(database: Database): Promise<RankedPerson[]> {
  const deletedMovies = database
    .select({uid: movies.uid})
    .from(movies)
    .where(isNotNull(movies.deletedAt));

  const eligible = database
    .select({
      personUid: movieCredits.personUid,
      movieCount: movieCount.as('movie_count'),
    })
    .from(movieCredits)
    .where(notInArray(movieCredits.movieUid, deletedMovies))
    .groupBy(movieCredits.personUid)
    .having(
      sql`${movieCount} >= 2 OR SUM(${movieCredits.job} = 'Director') > 0`,
    )
    .as('eligible');

  return database
    .select({uid: eligible.personUid, movieCount: eligible.movieCount})
    .from(eligible)
    .orderBy(sql`${eligible.movieCount} DESC`, eligible.personUid);
}

async function storeRanking(
  cache: EdgeCache,
  ranking: RankedPerson[],
): Promise<void> {
  const chunkCount = Math.ceil(ranking.length / CHUNK_SIZE);
  await Promise.all([
    cache.set(`${CACHE_PREFIX}:count`, ranking.length, CACHE_TTL),
    ...Array.from({length: chunkCount}, (_, index) =>
      cache.set(
        `${CACHE_PREFIX}:chunk:${index}`,
        ranking.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE),
        CACHE_TTL,
      ),
    ),
  ]);
}
