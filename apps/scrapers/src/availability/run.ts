import {and, eq, getDatabase, type Environment} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {translations} from '@shine/database/schema/translations';
import {findTMDBByImdbId, saveTMDBId} from '../common/tmdb-utilities';
import {checkMovieAvailability, type SourceRunners} from './checker';
import {
  ensureAvailableSelection,
  type LoadedMovie,
  type SelectionCheckSummary,
  type SelectionType,
} from './ensure-selection';
import {checkDiscas} from './sources/discas';
import {checkGeo} from './sources/geo';
import {checkTmdbProviders} from './sources/tmdb';
import {checkUnext} from './sources/unext';
import type {FetchLike} from './types';

type Database = ReturnType<typeof getDatabase>;

const SELECTION_TYPES: SelectionType[] = ['daily', 'weekly', 'monthly'];
const SCRAPE_WAIT_MS = 1500;

export async function loadMovieForCheck(
  database: Database,
  movieUid: string,
): Promise<LoadedMovie> {
  const movieRows = await database
    .select({
      uid: movies.uid,
      year: movies.year,
      imdbId: movies.imdbId,
      tmdbId: movies.tmdbId,
    })
    .from(movies)
    .where(eq(movies.uid, movieUid))
    .limit(1);

  const movie = movieRows[0];
  if (!movie) {
    throw new Error(`Movie not found: ${movieUid}`);
  }

  const titleRows = await database
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
    displayTitle: titles[0] ?? movie.uid,
    tmdbId: movie.tmdbId ?? undefined,
    imdbId: movie.imdbId ?? undefined,
    year: movie.year ?? undefined,
  };
}

export function createApiClient(options: {
  apiUrl: string;
  adminPassword: string;
  fetchImpl?: FetchLike;
}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  let token: string | undefined;

  async function login(): Promise<string> {
    if (token) {
      return token;
    }

    const response = await fetchImpl(`${options.apiUrl}/auth/login`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({password: options.adminPassword}),
    });
    if (!response.ok) {
      throw new Error(`Login failed: HTTP ${response.status}`);
    }

    const body = (await response.json()) as {token: string};
    token = body.token;
    return token;
  }

  return {
    async getSelections(): Promise<Record<SelectionType, string>> {
      const response = await fetchImpl(`${options.apiUrl}/?locale=ja`);
      if (!response.ok) {
        throw new Error(`Failed to fetch selections: HTTP ${response.status}`);
      }

      const body = (await response.json()) as Record<
        SelectionType,
        {uid: string}
      >;
      return {
        daily: body.daily.uid,
        weekly: body.weekly.uid,
        monthly: body.monthly.uid,
      };
    },

    async reselect(
      type: SelectionType,
      excludeMovieUids: string[],
    ): Promise<string> {
      const jwt = await login();
      const response = await fetchImpl(`${options.apiUrl}/reselect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({type, locale: 'ja', excludeMovieUids}),
      });
      if (!response.ok) {
        throw new Error(`Reselect failed: HTTP ${response.status}`);
      }

      const body = (await response.json()) as {movie: {uid: string}};
      return body.movie.uid;
    },
  };
}

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

  return {
    async tmdb(movie) {
      let tmdbId = movie.tmdbId;
      if (!tmdbId && movie.imdbId && tmdbApiKey) {
        const found = await findTMDBByImdbId(movie.imdbId, tmdbApiKey);
        if (found?.tmdbId) {
          tmdbId = found.tmdbId;
          await saveTMDBId(movie.imdbId, found.tmdbId, options.environment);
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
      return checkUnext(movie.titles, fetchImpl);
    },
    async discas(movie) {
      await sleep(waitMs);
      return checkDiscas(movie.titles, fetchImpl);
    },
    async geo(movie) {
      await sleep(waitMs);
      return checkGeo(movie.titles, fetchImpl);
    },
  };
}

export async function runAvailabilityCheck(options: {
  environment: Environment;
  apiUrl: string;
  adminPassword: string;
  fetchImpl?: FetchLike;
  sourceRunners?: SourceRunners;
  maxAttempts?: number;
  now?: Date;
}): Promise<SelectionCheckSummary[]> {
  const database = getDatabase(options.environment);
  const client = createApiClient({
    apiUrl: options.apiUrl,
    adminPassword: options.adminPassword,
    fetchImpl: options.fetchImpl,
  });
  const sourceRunners =
    options.sourceRunners ??
    buildSourceRunners({
      environment: options.environment,
      fetchImpl: options.fetchImpl,
    });

  const selections = await client.getSelections();
  const summaries: SelectionCheckSummary[] = [];

  for (const type of SELECTION_TYPES) {
    const summary = await ensureAvailableSelection({
      type,
      initialMovieUid: selections[type],
      maxAttempts: options.maxAttempts,
      loadMovie: async uid => loadMovieForCheck(database, uid),
      check: async movie =>
        checkMovieAvailability(database, movie, {
          sourceRunners,
          now: options.now,
        }),
      reselect: async (selectionType, excludeMovieUids) =>
        client.reselect(selectionType, excludeMovieUids),
    });
    summaries.push(summary);
  }

  return summaries;
}
