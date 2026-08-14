import {setTimeout as sleep} from 'node:timers/promises';
import {and, eq, isNull, notInArray, sql} from 'drizzle-orm';
import {getDatabase, type Environment} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {normalizeTitle} from './backfill-posters';
import {fetchJsonWithRetry} from './common/fetch-utilities';

export type OrphanDeletionStats = {
  candidates: number;
  deleted: number;
  misidentified: number;
  unverified: number;
  failed: number;
};

/**
 * DBのタイトルとIMDb(TMDb経由)のタイトルが同じ作品を指しているか。
 * IMDb側が確認できないときはundefined
 */
export function isSameFilm(
  storedTitle: string,
  imdbTitle?: string,
): boolean | undefined {
  if (imdbTitle === undefined) {
    return undefined;
  }

  return normalizeTitle(storedTitle) === normalizeTitle(imdbTitle);
}

type Orphan = {
  uid: string;
  imdbId: string | null;
  year: number | null;
  title: string | null;
};

export async function deleteOrphanMovies({
  environment,
  dryRun = false,
  limit,
  throttleMs = 300,
}: {
  environment: Environment;
  dryRun?: boolean;
  limit?: number;
  throttleMs?: number;
}): Promise<OrphanDeletionStats> {
  const stats: OrphanDeletionStats = {
    candidates: 0,
    deleted: 0,
    misidentified: 0,
    unverified: 0,
    failed: 0,
  };

  const database = getDatabase(environment);
  const nominatedUids = database
    .select({movieUid: nominations.movieUid})
    .from(nominations);

  const rows = await database
    .select({
      uid: movies.uid,
      imdbId: movies.imdbId,
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
    .where(
      and(isNull(movies.deletedAt), notInArray(movies.uid, nominatedUids)),
    );

  const orphans = limit === undefined ? rows : rows.slice(0, limit);
  stats.candidates = orphans.length;

  if (orphans.length === 0) {
    console.log('No orphan movies found.');
    return stats;
  }

  console.log(
    `${dryRun ? '[DRY RUN] ' : ''}Deleting ${orphans.length} movies with no nominations...`,
  );

  const deletedAt = Math.floor(Date.now() / 1000);

  for (const orphan of orphans) {
    try {
      const verdict = await verifyOrphan(orphan, environment.TMDB_API_KEY);
      if (verdict === 'misidentified') {
        stats.misidentified++;
      } else if (verdict === 'unverified') {
        stats.unverified++;
      }

      console.log(
        `  [${verdict}] ${orphan.title ?? orphan.uid} (${orphan.year ?? '?'}) ${orphan.imdbId ?? ''}`,
      );
      stats.deleted++;

      if (dryRun) {
        continue;
      }

      // 誤ったIMDb IDはunique制約を占有し続けるので手放す
      await database
        .update(movies)
        .set(
          verdict === 'misidentified'
            ? {deletedAt, imdbId: sql`NULL`, tmdbId: sql`NULL`}
            : {deletedAt},
        )
        .where(eq(movies.uid, orphan.uid));
    } catch (error) {
      console.error(`  Failed for ${orphan.uid}:`, error);
      stats.failed++;
    }

    if (throttleMs > 0 && orphan.imdbId) {
      await sleep(throttleMs);
    }
  }

  console.log('\nDeletion summary:');
  console.log(`  Candidates: ${stats.candidates}`);
  console.log(`  Deleted: ${stats.deleted}`);
  console.log(`  Misidentified (IDs cleared): ${stats.misidentified}`);
  console.log(`  Unverified on IMDb: ${stats.unverified}`);
  console.log(`  Failed: ${stats.failed}`);

  return stats;
}

type Verdict = 'no-imdb-id' | 'matches-imdb' | 'misidentified' | 'unverified';

async function verifyOrphan(
  orphan: Orphan,
  tmdbApiKey: string | undefined,
): Promise<Verdict> {
  if (!orphan.imdbId || !orphan.title || !tmdbApiKey) {
    return 'no-imdb-id';
  }

  const imdbTitle = await fetchTitleByImdbId(orphan.imdbId, tmdbApiKey);
  const same = isSameFilm(orphan.title, imdbTitle);
  if (same === undefined) {
    return 'unverified';
  }

  return same ? 'matches-imdb' : 'misidentified';
}

async function fetchTitleByImdbId(
  imdbId: string,
  tmdbApiKey: string,
): Promise<string | undefined> {
  const url = new URL(`https://api.themoviedb.org/3/find/${imdbId}`);
  url.searchParams.set('api_key', tmdbApiKey);
  url.searchParams.set('external_source', 'imdb_id');

  try {
    const data = await fetchJsonWithRetry<{
      movie_results?: Array<{title?: string}>;
      tv_results?: Array<{name?: string}>;
    }>(url.toString());

    return data.movie_results?.[0]?.title ?? data.tv_results?.[0]?.name;
  } catch (error) {
    console.error(`  IMDb lookup failed for ${imdbId}:`, error);
    return undefined;
  }
}
