import {type Environment} from '@shine/database';
import {saveTMDBId} from '@shine/tmdb/persistence';
import {findTMDBByImdbId} from '@shine/tmdb';
import {
  fetchJapaneseAlternativeTitles,
  type MovieToCheck,
  type SourceRunners,
  checkDiscas,
  checkTmdbProviders,
  checkUnext,
  type FetchLike,
} from '@shine/availability';
const SCRAPE_WAIT_MS = 1500;

const sleep = async (ms: number) =>
  new Promise(resolve => {
    setTimeout(resolve, ms);
  });

export function buildSourceRunners(options: {
  environment: Environment;
  fetchImpl?: FetchLike;
  waitMs?: number;
}): SourceRunners {
  const fetchImpl = options.fetchImpl ?? fetch;
  const waitMs = options.waitMs ?? SCRAPE_WAIT_MS;
  const tmdbApiKey = options.environment.TMDB_API_KEY ?? '';
  const alternativeTitlesCache = new Map<string, Promise<string[]>>();

  // 検索クエリは先頭のタイトルが使われるため、別題は必ず後ろに足す
  async function titlesForSearch(movie: MovieToCheck): Promise<string[]> {
    if (!movie.tmdbId) {
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
      let tmdbId = movie.tmdbId;
      if (tmdbApiKey && !tmdbId && movie.imdbId) {
        let found: Awaited<ReturnType<typeof findTMDBByImdbId>>;
        try {
          found = await findTMDBByImdbId(movie.imdbId, tmdbApiKey);
        } catch (error) {
          return {
            source: 'tmdb' as const,
            status: 'error' as const,
            detail: `TMDb lookup failed: ${String(error)}`,
          };
        }

        if (found?.tmdbId) {
          tmdbId = found.tmdbId;
          await saveTMDBId(
            movie.imdbId,
            found.tmdbId,
            options.environment,
            found.mediaType,
          );
        }
      }

      if (!tmdbId) {
        return {
          source: 'tmdb' as const,
          status: 'error' as const,
          detail: 'No TMDb ID (check skipped)',
        };
      }

      return checkTmdbProviders(tmdbId, tmdbApiKey, fetchImpl);
    },
    async unext(movie) {
      await sleep(waitMs);
      return checkUnext(await titlesForSearch(movie), fetchImpl);
    },
    async discas(movie) {
      await sleep(waitMs);
      return checkDiscas(await titlesForSearch(movie), fetchImpl, {
        year: movie.year,
      });
    },
  };
}
