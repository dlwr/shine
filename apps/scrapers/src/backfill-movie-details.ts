import {setTimeout as sleep} from 'node:timers/promises';
import {and, eq, isNotNull, isNull, or} from 'drizzle-orm';
import {type Environment, type getDatabase} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {fetchTMDBMovieDetails} from '@shine/tmdb';

type DatabaseClient = ReturnType<typeof getDatabase>;

export type BackfillContext = {
  database: DatabaseClient;
  environment: Environment;
  isDryRun: boolean;
};

export type BackfillOptions = {
  limit?: number;
  throttleMs?: number;
  concurrency?: number;
  onProgress?: (processed: number, total: number) => void;
};

export type BackfillResult = {
  updated: number;
  missing: number;
  failed: number;
};

export async function backfillMovieDetails(
  context: BackfillContext,
  options: BackfillOptions = {},
): Promise<BackfillResult> {
  const query = context.database
    .select({
      uid: movies.uid,
      tmdbId: movies.tmdbId,
      releaseDate: movies.releaseDate,
      runtime: movies.runtime,
    })
    .from(movies)
    .where(
      and(
        isNull(movies.deletedAt),
        isNotNull(movies.tmdbId),
        eq(movies.mediaType, 'movie'),
        or(isNull(movies.releaseDate), isNull(movies.runtime)),
      ),
    );
  const pending = await (options.limit === undefined
    ? query
    : query.limit(options.limit));

  let updated = 0;
  let missing = 0;
  let failed = 0;
  let cursor = 0;

  async function runWorker(): Promise<void> {
    for (;;) {
      const index = cursor;
      cursor++;

      if (index >= pending.length) {
        return;
      }

      const target = pending[index];

      try {
        const details = await fetchTMDBMovieDetails(
          target.tmdbId ?? 0,
          context.environment.TMDB_API_KEY ?? '',
        );
        const changes = {
          ...(target.releaseDate === null &&
            details?.release_date && {releaseDate: details.release_date}),
          ...(target.runtime === null &&
            details?.runtime && {runtime: details.runtime}),
        };

        if (details === undefined) {
          failed++;
        } else if (Object.keys(changes).length === 0) {
          missing++;
        } else {
          if (!context.isDryRun) {
            await context.database
              .update(movies)
              .set(changes)
              .where(eq(movies.uid, target.uid));
          }

          updated++;
        }
      } catch (error) {
        console.error(`映画の詳細の取得に失敗しました (${target.uid}):`, error);
        failed++;
      }

      options.onProgress?.(updated + missing + failed, pending.length);

      if (options.throttleMs) {
        await sleep(options.throttleMs);
      }
    }
  }

  const workerCount = Math.max(
    1,
    Math.min(options.concurrency ?? 1, pending.length),
  );
  await Promise.all(Array.from({length: workerCount}, async () => runWorker()));

  return {updated, missing, failed};
}
