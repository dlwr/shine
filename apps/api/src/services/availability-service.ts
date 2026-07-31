import {
  checkDiscas,
  checkMovieAvailability,
  checkTmdbProviders,
  checkUnext,
  fetchJapaneseAlternativeTitles,
  type FetchLike,
  type MovieToCheck,
  type SourceRunners,
} from '@shine/availability';
import {and, eq, isNull, type Environment} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {translations} from '@shine/database/schema/translations';
import {BaseService} from './base-service';

const RETRY_DELAY_MS = 250;

export type AvailabilityCheckResult = {
  available: boolean;
  availability: Array<{
    source: string;
    detail: string | undefined;
    checkedAt: number;
  }>;
};

export function buildOnDemandRunners(
  environment: Environment,
  fetchImpl: FetchLike = fetch,
): SourceRunners {
  const tmdbApiKey = environment.TMDB_API_KEY ?? '';
  const alternativeTitlesCache = new Map<string, Promise<string[]>>();

  // 検索クエリは先頭のタイトルが使われるため、別題は必ず後ろに足す
  async function titlesForSearch(movie: MovieToCheck): Promise<string[]> {
    if (!movie.tmdbId || !tmdbApiKey) {
      return movie.titles;
    }

    let pending = alternativeTitlesCache.get(movie.uid);
    if (!pending) {
      pending = fetchJapaneseAlternativeTitles(
        movie.tmdbId,
        tmdbApiKey,
        fetchImpl,
      );
      alternativeTitlesCache.set(movie.uid, pending);
    }

    const alternativeTitles = await pending;
    return [...new Set([...movie.titles, ...alternativeTitles])];
  }

  return {
    async tmdb(movie) {
      if (!movie.tmdbId || !tmdbApiKey) {
        return {
          source: 'tmdb',
          status: 'error',
          detail: 'No TMDb ID (check skipped)',
        };
      }

      return checkTmdbProviders(movie.tmdbId, tmdbApiKey, fetchImpl);
    },
    async unext(movie) {
      return checkUnext(await titlesForSearch(movie), fetchImpl);
    },
    async discas(movie) {
      return checkDiscas(await titlesForSearch(movie), fetchImpl);
    },
  };
}

export class AvailabilityService extends BaseService {
  async checkMovie(
    movieUid: string,
    runners: SourceRunners,
  ): Promise<AvailabilityCheckResult | undefined> {
    const movie = await this.loadMovie(movieUid);
    if (!movie) {
      return undefined;
    }

    const decision = await checkMovieAvailability(this.database, movie, {
      sourceRunners: runners,
      retryDelayMs: RETRY_DELAY_MS,
    });

    const nowEpoch = Math.floor(Date.now() / 1000);
    return {
      available: decision.available,
      availability: decision.results
        .filter(result => result.status === 'ok')
        .map(result => ({
          source: result.source,
          detail: result.detail,
          checkedAt: nowEpoch,
        })),
    };
  }

  private async loadMovie(movieUid: string): Promise<MovieToCheck | undefined> {
    const movieRows = await this.database
      .select({
        uid: movies.uid,
        year: movies.year,
        imdbId: movies.imdbId,
        tmdbId: movies.tmdbId,
      })
      .from(movies)
      .where(and(eq(movies.uid, movieUid), isNull(movies.deletedAt)))
      .limit(1);

    const movie = movieRows[0];
    if (!movie) {
      return undefined;
    }

    const titleRows = await this.database
      .select({
        languageCode: translations.languageCode,
        content: translations.content,
      })
      .from(translations)
      .where(
        and(
          eq(translations.resourceUid, movieUid),
          eq(translations.resourceType, 'movie_title'),
        ),
      );

    const japaneseTitles = titleRows.filter(row => row.languageCode === 'ja');
    const otherTitles = titleRows.filter(row => row.languageCode !== 'ja');
    const titles = [...japaneseTitles, ...otherTitles]
      .map(row => row.content)
      .filter(title => title.trim() !== '');

    return {
      uid: movie.uid,
      titles,
      tmdbId: movie.tmdbId ?? undefined,
      imdbId: movie.imdbId ?? undefined,
      year: movie.year ?? undefined,
    };
  }
}
