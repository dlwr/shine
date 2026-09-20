import {getDatabase, type Environment} from '@shine/database';
import {
  fetchJapaneseTitleFromTMDB,
  saveJapaneseTranslation,
} from '@shine/tmdb/persistence';
import {
  checkMovieAvailability,
  type SourceRunners,
  type FetchLike,
} from '@shine/availability';
import {
  ensureAvailableSelection,
  type SelectionCheckSummary,
  type SelectionType,
} from './ensure-selection';
import {createApiClient} from './api-client';
import {loadMovieEnsuringJapaneseTitle} from './movie-for-check';
import {buildSourceRunners} from './source-runners';

const SELECTION_TYPES: SelectionType[] = ['daily', 'weekly', 'monthly'];

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
