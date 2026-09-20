import {isNull} from 'drizzle-orm';
import {type Environment} from '@shine/database';
import {movieCredits} from '@shine/database/schema/movie-credits';
import {movies} from '@shine/database/schema/movies';
import {hasOnlyLatinOrJapaneseScript} from '@shine/utils';
import {fetchTMDBCredits} from '@shine/tmdb';
import {saveMovieCredits, type SaveContext} from './movie-credits/save-credits';
import {selectCredits} from './movie-credits/select-credits';

export type ImportContext = SaveContext & {
  environment: Environment;
};

export type ImportOptions = {
  force?: boolean;
  limit?: number;
  throttleMs?: number;
  concurrency?: number;
  onProgress?: (processed: number, total: number) => void;
};

export type ImportResult = {
  processed: number;
  skipped: number;
  failed: number;
};

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

export async function importMovieCredits(
  context: ImportContext,
  options: ImportOptions = {},
): Promise<ImportResult> {
  const targets = await context.database
    .select({
      uid: movies.uid,
      tmdbId: movies.tmdbId,
      mediaType: movies.mediaType,
    })
    .from(movies)
    .where(isNull(movies.deletedAt));

  const importedRows = options.force
    ? []
    : await context.database
        .selectDistinct({movieUid: movieCredits.movieUid})
        .from(movieCredits);
  const alreadyImported = new Set(importedRows.map(row => row.movieUid));

  const eligible = targets.filter(
    target => target.tmdbId && !alreadyImported.has(target.uid),
  );
  const pending =
    options.limit === undefined ? eligible : eligible.slice(0, options.limit);

  let processed = 0;
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
        const credits = await fetchTMDBCredits(
          target.tmdbId ?? 0,
          target.mediaType === 'tv' ? 'tv' : 'movie',
          context.environment.TMDB_API_KEY ?? '',
        );

        if (credits) {
          const selected = selectCredits(credits);
          const english = selected.some(
            credit => !hasOnlyLatinOrJapaneseScript(credit.name),
          )
            ? await fetchTMDBCredits(
                target.tmdbId ?? 0,
                target.mediaType === 'tv' ? 'tv' : 'movie',
                context.environment.TMDB_API_KEY ?? '',
                'en-US',
              )
            : undefined;
          await saveMovieCredits(
            context,
            target.uid,
            english ? selectCredits(credits, english) : selected,
          );
          processed++;
        } else {
          failed++;
        }
      } catch (error) {
        console.error(
          `クレジットの取り込みに失敗しました (${target.uid}):`,
          error,
        );
        failed++;
      }

      options.onProgress?.(processed + failed, pending.length);

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

  return {processed, skipped: targets.length - pending.length, failed};
}
