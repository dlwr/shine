import {and, eq, inArray, isNull} from 'drizzle-orm';
import {type Environment, type getDatabase} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {translations} from '@shine/database/schema/translations';
import {fetchTMDBDetails} from './common/tmdb-utilities';

type DatabaseClient = ReturnType<typeof getDatabase>;

export type SaveContext = {
  database: DatabaseClient;
  isDryRun: boolean;
};

export type ImportContext = SaveContext & {
  environment: Environment;
};

const JAPANESE_CHARACTERS =
  /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;

export function isJapaneseOverview(overview: string | undefined): boolean {
  return JAPANESE_CHARACTERS.test(overview?.trim() ?? '');
}

export async function saveMovieDescription(
  context: SaveContext,
  movieUid: string,
  description: string,
): Promise<void> {
  if (context.isDryRun) {
    return;
  }

  const content = description.trim();

  await context.database
    .insert(translations)
    .values({
      resourceType: 'movie_description',
      resourceUid: movieUid,
      languageCode: 'ja',
      content,
      isDefault: 0,
    })
    .onConflictDoUpdate({
      target: [
        translations.resourceType,
        translations.resourceUid,
        translations.languageCode,
      ],
      set: {content},
    });
}

export type ImportOptions = {
  force?: boolean;
  limit?: number;
  throttleMs?: number;
  concurrency?: number;
  onProgress?: (processed: number, total: number) => void;
};

export type ImportResult = {
  saved: number;
  missing: number;
  skipped: number;
  failed: number;
};

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

export async function importMovieDescriptions(
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

  const eligible = targets.filter(target => target.tmdbId);

  const described = options.force
    ? []
    : await context.database
        .select({resourceUid: translations.resourceUid})
        .from(translations)
        .where(
          and(
            eq(translations.resourceType, 'movie_description'),
            eq(translations.languageCode, 'ja'),
            inArray(
              translations.resourceUid,
              eligible.map(target => target.uid),
            ),
          ),
        );
  const alreadyDescribed = new Set(described.map(row => row.resourceUid));

  const remaining = eligible.filter(
    target => !alreadyDescribed.has(target.uid),
  );
  const pending =
    options.limit === undefined ? remaining : remaining.slice(0, options.limit);

  let saved = 0;
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
        const details = await fetchTMDBDetails(
          target.tmdbId ?? 0,
          target.mediaType === 'tv' ? 'tv' : 'movie',
          context.environment.TMDB_API_KEY ?? '',
          'ja-JP',
        );

        if (details === undefined) {
          failed++;
        } else if (isJapaneseOverview(details.overview)) {
          await saveMovieDescription(
            context,
            target.uid,
            details.overview ?? '',
          );
          saved++;
        } else {
          missing++;
        }
      } catch (error) {
        console.error(
          `あらすじの取り込みに失敗しました (${target.uid}):`,
          error,
        );
        failed++;
      }

      options.onProgress?.(saved + missing + failed, pending.length);

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

  return {saved, missing, skipped: targets.length - pending.length, failed};
}
