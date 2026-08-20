import {setTimeout as sleep} from 'node:timers/promises';
import {and, eq, isNotNull, isNull, or, sql} from 'drizzle-orm';
import {getDatabase, type Environment} from '@shine/database';
import {movieSelections} from '@shine/database/schema/movie-selections';
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

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** 週はAPIのselections-serviceと同じく金曜始まり、月は1日をキーにする */
export function selectionDateKeys(date: string): {
  daily: string;
  weekly: string;
  monthly: string;
} {
  const [year, month, day] = date.split('-').map(Number);
  const daily = new Date(Date.UTC(year, month - 1, day));
  const daysSinceFriday = (daily.getUTCDay() - 5 + 7) % 7;
  const friday = new Date(Date.UTC(year, month - 1, day - daysSinceFriday));
  const format = (value: Date) =>
    `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
  return {
    daily: format(daily),
    weekly: format(friday),
    monthly: `${year}-${pad(month)}-01`,
  };
}

export async function buildTmdbJaWorklist({
  environment,
  limit,
  throttleMs = 150,
  selectionDate,
  onProgress,
}: {
  environment: Environment;
  limit?: number;
  throttleMs?: number;
  selectionDate?: string;
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

  let eligible = rows.filter(
    row =>
      row.jaTitle !== null &&
      hasKana(row.jaTitle) &&
      row.jaDescription === null,
  );

  if (selectionDate !== undefined) {
    const keys = selectionDateKeys(selectionDate);
    const selectionRows = await database
      .select({movieId: movieSelections.movieId})
      .from(movieSelections)
      .where(
        or(
          and(
            eq(movieSelections.selectionType, 'daily'),
            eq(movieSelections.selectionDate, keys.daily),
          ),
          and(
            eq(movieSelections.selectionType, 'weekly'),
            eq(movieSelections.selectionDate, keys.weekly),
          ),
          and(
            eq(movieSelections.selectionType, 'monthly'),
            eq(movieSelections.selectionDate, keys.monthly),
          ),
        ),
      );
    const selectedUids = new Set(selectionRows.map(row => row.movieId));
    eligible = rows.filter(
      row =>
        selectedUids.has(row.uid) &&
        row.jaTitle !== null &&
        hasKana(row.jaTitle),
    );
  }
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
