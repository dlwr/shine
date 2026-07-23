import {and, eq, getDatabase, type Environment} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {translations} from '@shine/database/schema/translations';
import {
  fetchJapaneseTitleFromTMDB,
  findTMDBByImdbId,
  saveJapaneseTranslation,
  saveTMDBId,
} from '../common/tmdb-utilities';
import {hasJapaneseText} from './title-match';
import {
  checkMovieAvailability,
  deleteNonOkChecks,
  type SourceRunners,
} from './checker';
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
    hasJapaneseTitle: japaneseTitles.some(row => hasJapaneseText(row.content)),
    tmdbId: movie.tmdbId ?? undefined,
    imdbId: movie.imdbId ?? undefined,
    year: movie.year ?? undefined,
  };
}

export async function loadMovieEnsuringJapaneseTitle(
  database: Database,
  movieUid: string,
  options: {
    refreshTmdbData: (movieUid: string, imdbId: string) => Promise<void>;
    fetchJapaneseTitle?: (
      imdbId: string,
      tmdbId: number | undefined,
    ) => Promise<string | undefined>;
    saveJapaneseTitle?: (movieUid: string, title: string) => Promise<void>;
  },
): Promise<LoadedMovie> {
  const movie = await loadMovieForCheck(database, movieUid);
  if (movie.hasJapaneseTitle) {
    return movie;
  }

  if (!movie.imdbId) {
    return {...movie, japaneseTitleMissing: true};
  }

  try {
    await options.refreshTmdbData(movieUid, movie.imdbId);
  } catch (error) {
    console.error(`Failed to refresh TMDb data for ${movieUid}:`, error);
    return {...movie, japaneseTitleMissing: true};
  }

  // 管理APIは既存の翻訳レコードを上書きしないため、
  // ja行が日本語でない場合はTMDbのjaタイトルでupsertする
  if (options.fetchJapaneseTitle && options.saveJapaneseTitle) {
    try {
      const title = await options.fetchJapaneseTitle(
        movie.imdbId,
        movie.tmdbId,
      );
      if (title && hasJapaneseText(title)) {
        await options.saveJapaneseTitle(movieUid, title);
      }
    } catch (error) {
      console.error(
        `Failed to fetch Japanese title for ${movieUid}:`,
        error,
      );
    }
  }

  const reloaded = await loadMovieForCheck(database, movieUid);
  if (!reloaded.hasJapaneseTitle) {
    return {...reloaded, japaneseTitleMissing: true};
  }

  // 検索の前提となるタイトルが変わったので、過去のng/error判定は破棄する
  await deleteNonOkChecks(database, movieUid);
  return {...reloaded, fetchedJapaneseTitle: reloaded.titles[0]};
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
    async getNextSelections(): Promise<
      Record<SelectionType, {uid: string; date: string}>
    > {
      const jwt = await login();
      const response = await fetchImpl(
        `${options.apiUrl}/admin/preview-selections?locale=ja`,
        {headers: {Authorization: `Bearer ${jwt}`}},
      );
      if (!response.ok) {
        throw new Error(
          `Failed to fetch next selections: HTTP ${response.status}`,
        );
      }

      const body = (await response.json()) as Record<
        'nextDaily' | 'nextWeekly' | 'nextMonthly',
        {date: string; movie?: {uid: string}}
      >;
      const keys = {
        daily: 'nextDaily',
        weekly: 'nextWeekly',
        monthly: 'nextMonthly',
      } as const;

      const result = {} as Record<SelectionType, {uid: string; date: string}>;
      for (const type of Object.keys(keys) as SelectionType[]) {
        const preview = body[keys[type]];
        if (!preview?.movie?.uid) {
          throw new Error(`No next selection for ${type}`);
        }

        result[type] = {uid: preview.movie.uid, date: preview.date};
      }

      return result;
    },

    async reselect(
      type: SelectionType,
      excludeMovieUids: string[],
      date: string,
    ): Promise<string> {
      const jwt = await login();
      const response = await fetchImpl(`${options.apiUrl}/reselect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({type, locale: 'ja', excludeMovieUids, date}),
      });
      if (!response.ok) {
        throw new Error(`Reselect failed: HTTP ${response.status}`);
      }

      const body = (await response.json()) as {movie: {uid: string}};
      return body.movie.uid;
    },

    async refreshTmdbData(movieUid: string, imdbId: string): Promise<void> {
      const jwt = await login();
      const response = await fetchImpl(
        `${options.apiUrl}/admin/movies/${movieUid}/imdb-id`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${jwt}`,
          },
          body: JSON.stringify({imdbId, refreshData: true}),
        },
      );
      if (!response.ok) {
        throw new Error(`TMDb refresh failed: HTTP ${response.status}`);
      }
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

  const selections = await client.getNextSelections();
  const summaries: SelectionCheckSummary[] = [];

  for (const type of SELECTION_TYPES) {
    const {uid, date} = selections[type];
    const summary = await ensureAvailableSelection({
      type,
      initialMovieUid: uid,
      maxAttempts: options.maxAttempts,
      loadMovie: async movieUid =>
        loadMovieEnsuringJapaneseTitle(database, movieUid, {
          refreshTmdbData: async (uid, imdbId) =>
            client.refreshTmdbData(uid, imdbId),
          fetchJapaneseTitle: async (imdbId, tmdbId) =>
            fetchJapaneseTitleFromTMDB(imdbId, tmdbId, options.environment),
          saveJapaneseTitle: async (uid, title) =>
            saveJapaneseTranslation(uid, title, options.environment),
        }),
      check: async movie =>
        checkMovieAvailability(database, movie, {
          sourceRunners,
          now: options.now,
        }),
      reselect: async (selectionType, excludeMovieUids) =>
        client.reselect(selectionType, excludeMovieUids, date),
    });
    summaries.push({...summary, date});
  }

  return summaries;
}
