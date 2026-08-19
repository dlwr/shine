import {eq, isNull} from 'drizzle-orm';
import {type Environment, type getDatabase} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {fetchTMDBDetails} from './common/tmdb-utilities';

type DatabaseClient = ReturnType<typeof getDatabase>;

export type FixContext = {
  database: DatabaseClient;
  environment: Environment;
  isDryRun: boolean;
};

export type FixOptions = {
  limit?: number;
  throttleMs?: number;
  concurrency?: number;
  onProgress?: (processed: number, total: number) => void;
  onFix?: (movieUid: string, from: string, to: string) => void;
};

export type FixResult = {
  updated: number;
  matched: number;
  unknown: number;
  failed: number;
  skipped: number;
};

const NO_LANGUAGE = 'xx';

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

export async function fixOriginalLanguages(
  context: FixContext,
  options: FixOptions = {},
): Promise<FixResult> {
  const targets = await context.database
    .select({
      uid: movies.uid,
      tmdbId: movies.tmdbId,
      mediaType: movies.mediaType,
      originalLanguage: movies.originalLanguage,
    })
    .from(movies)
    .where(isNull(movies.deletedAt));

  const eligible = targets.filter(target => target.tmdbId);
  const pending =
    options.limit === undefined ? eligible : eligible.slice(0, options.limit);

  let updated = 0;
  let matched = 0;
  let unknown = 0;
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
        const details = await fetchTMDBDetails(
          target.tmdbId ?? 0,
          target.mediaType === 'tv' ? 'tv' : 'movie',
          context.environment.TMDB_API_KEY ?? '',
        );
        const language = details?.original_language;

        if (details === undefined) {
          failed++;
        } else if (!language || language === NO_LANGUAGE) {
          unknown++;
        } else if (language === target.originalLanguage) {
          matched++;
        } else {
          if (!context.isDryRun) {
            await context.database
              .update(movies)
              .set({originalLanguage: language})
              .where(eq(movies.uid, target.uid));
          }

          options.onFix?.(target.uid, target.originalLanguage, language);
          updated++;
        }
      } catch (error) {
        console.error(`原語の照合に失敗しました (${target.uid}):`, error);
        failed++;
      }

      options.onProgress?.(
        updated + matched + unknown + failed,
        pending.length,
      );

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

  return {
    updated,
    matched,
    unknown,
    failed,
    skipped: targets.length - pending.length,
  };
}
