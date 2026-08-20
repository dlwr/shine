import {setTimeout as sleep} from 'node:timers/promises';
import {and, eq, isNotNull, isNull, sql} from 'drizzle-orm';
import {getDatabase, type Environment} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {hasKana} from './common/japanese-text';
import {
  fetchTMDBMovieDetails,
  fetchTMDBMovieTranslations,
} from './common/tmdb-utilities';

export type TmdbJaWorklistItem = {
  uid: string;
  tmdbId: number;
  year: number | undefined;
  jaTitle: string;
  enTitle: string;
  enOverview: string | undefined;
  tmdbJaTitle: string | undefined;
  tmdbHasJaOverview: boolean;
  editUrl: string;
};

export type TmdbJaWorklistStats = {
  candidates: number;
  listed: number;
  tmdbComplete: number;
  failed: number;
};

function normalize(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

export async function buildTmdbJaWorklist({
  environment,
  limit,
  throttleMs = 150,
  onProgress,
}: {
  environment: Environment;
  limit?: number;
  throttleMs?: number;
  onProgress?: (processed: number, total: number) => void;
}): Promise<{items: TmdbJaWorklistItem[]; stats: TmdbJaWorklistStats}> {
  const database = getDatabase(environment);
  const rows = await database
    .select({
      uid: movies.uid,
      tmdbId: movies.tmdbId,
      year: movies.year,
      jaTitle: sql<string | null>`(
        SELECT content FROM translations
        WHERE translations.resource_uid = movies.uid
          AND translations.resource_type = 'movie_title'
          AND translations.language_code = 'ja'
        LIMIT 1
      )`.as('jaTitle'),
      jaDescription: sql<string | null>`(
        SELECT content FROM translations
        WHERE translations.resource_uid = movies.uid
          AND translations.resource_type = 'movie_description'
          AND translations.language_code = 'ja'
        LIMIT 1
      )`.as('jaDescription'),
    })
    .from(movies)
    .where(
      and(
        isNull(movies.deletedAt),
        isNotNull(movies.tmdbId),
        eq(movies.mediaType, 'movie'),
      ),
    );

  const eligible = rows.filter(
    row =>
      row.jaTitle !== null &&
      hasKana(row.jaTitle) &&
      row.jaDescription === null,
  );
  const candidates = limit === undefined ? eligible : eligible.slice(0, limit);

  const stats: TmdbJaWorklistStats = {
    candidates: candidates.length,
    listed: 0,
    tmdbComplete: 0,
    failed: 0,
  };
  const items: TmdbJaWorklistItem[] = [];
  const apiKey = environment.TMDB_API_KEY ?? '';

  async function processCandidate(
    candidate: (typeof candidates)[number],
  ): Promise<void> {
    const tmdbId = candidate.tmdbId ?? 0;
    const translationsResponse = await fetchTMDBMovieTranslations(
      tmdbId,
      apiKey,
    );

    if (translationsResponse === undefined) {
      stats.failed++;
      return;
    }

    const jaEntry = translationsResponse.translations.find(
      entry => entry.iso_639_1 === 'ja',
    );
    const tmdbJaTitle = normalize(jaEntry?.data.title);
    const tmdbJaOverview = normalize(jaEntry?.data.overview);

    if (tmdbJaTitle && tmdbJaOverview) {
      stats.tmdbComplete++;
      return;
    }

    const details = await fetchTMDBMovieDetails(tmdbId, apiKey, 'en-US');
    if (details === undefined) {
      stats.failed++;
      return;
    }

    items.push({
      uid: candidate.uid,
      tmdbId,
      year: candidate.year ?? undefined,
      jaTitle: candidate.jaTitle ?? '',
      enTitle: details.title,
      enOverview: normalize(details.overview),
      tmdbJaTitle,
      tmdbHasJaOverview: tmdbJaOverview !== undefined,
      editUrl: `https://www.themoviedb.org/movie/${tmdbId}/edit?active_nav_item=primary_facts`,
    });
    stats.listed++;
  }

  for (const [index, candidate] of candidates.entries()) {
    await processCandidate(candidate);
    onProgress?.(index + 1, candidates.length);

    if (throttleMs > 0 && index + 1 < candidates.length) {
      await sleep(throttleMs);
    }
  }

  return {items, stats};
}
