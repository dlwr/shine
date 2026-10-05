import {setTimeout as sleep} from 'node:timers/promises';
import {and, isNotNull, isNull, ne, sql} from 'drizzle-orm';
import {getDatabase, type Environment} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {fetchTMDBImages, type TMDBMediaType} from '@shine/tmdb';
import {savePosterUrls} from '@shine/tmdb/persistence';
import {selectionDateKeys} from './common/selection-dates';

export type JaPosterCandidate = {
  uid: string;
  tmdbId: number;
  mediaType: TMDBMediaType;
  year: number | undefined;
  jaTitle: string;
};

export type JaPosterSyncStats = {
  checked: number;
  found: number;
  failed: number;
};

export async function findJaPosterCandidates({
  environment,
  today,
}: {
  environment: Environment;
  today: string;
}): Promise<JaPosterCandidate[]> {
  const keys = selectionDateKeys(today);
  const rows = await getDatabase(environment)
    .select({
      uid: movies.uid,
      tmdbId: movies.tmdbId,
      mediaType: movies.mediaType,
      year: movies.year,
      jaTitle: sql<string>`(
        SELECT content FROM translations
        WHERE translations.resource_type = 'movie_title'
          AND translations.resource_uid = movies.uid
          AND translations.language_code = 'ja'
      )`,
    })
    .from(movies)
    .where(
      and(
        isNull(movies.deletedAt),
        isNotNull(movies.tmdbId),
        ne(movies.originalLanguage, 'ja'),
        sql`EXISTS (
          SELECT 1 FROM translations
          WHERE translations.resource_type = 'movie_title'
            AND translations.resource_uid = movies.uid
            AND translations.language_code = 'ja'
        )`,
        sql`NOT EXISTS (
          SELECT 1 FROM poster_urls
          WHERE poster_urls.movie_uid = movies.uid
            AND poster_urls.language_code = 'ja'
        )`,
      ),
    )
    .orderBy(
      sql`CASE
        WHEN EXISTS (
          SELECT 1 FROM movie_selections
          WHERE movie_selections.movie_id = movies.uid
            AND (
              (movie_selections.selection_type = 'monthly' AND movie_selections.selection_date >= ${keys.monthly})
              OR (movie_selections.selection_type = 'weekly' AND movie_selections.selection_date >= ${keys.weekly})
              OR (movie_selections.selection_type = 'daily' AND movie_selections.selection_date >= ${keys.daily})
            )
        ) THEN 0
        WHEN EXISTS (
          SELECT 1 FROM nominations
          WHERE nominations.movie_uid = movies.uid
            AND nominations.is_winner = 1
        ) THEN 1
        ELSE 2
      END`,
      movies.uid,
    );

  return rows.map(row => ({
    uid: row.uid,
    tmdbId: row.tmdbId ?? 0,
    mediaType: row.mediaType === 'tv' ? 'tv' : 'movie',
    year: row.year ?? undefined,
    jaTitle: row.jaTitle,
  }));
}

export async function syncJaPosters({
  environment,
  candidates,
  isDryRun,
  throttleMs,
  onFound,
}: {
  environment: Environment;
  candidates: JaPosterCandidate[];
  isDryRun: boolean;
  throttleMs: number;
  onFound?: (candidate: JaPosterCandidate, posterCount: number) => void;
}): Promise<JaPosterSyncStats> {
  const stats: JaPosterSyncStats = {checked: 0, found: 0, failed: 0};
  const apiKey = environment.TMDB_API_KEY ?? '';

  for (const [index, candidate] of candidates.entries()) {
    try {
      const images = await fetchTMDBImages(
        candidate.tmdbId,
        candidate.mediaType,
        apiKey,
        'ja',
      );
      const jaPosters = (images?.posters ?? []).filter(
        poster => poster.iso_639_1 === 'ja',
      );
      stats.checked++;

      if (jaPosters.length > 0) {
        stats.found++;
        onFound?.(candidate, jaPosters.length);
        if (!isDryRun) {
          await savePosterUrls(candidate.uid, jaPosters, environment);
        }
      }
    } catch (error) {
      console.error(`TMDb の画像の取得に失敗しました: ${candidate.uid}`, error);
      stats.failed++;
    }

    if (throttleMs > 0 && index + 1 < candidates.length) {
      await sleep(throttleMs);
    }
  }

  return stats;
}
