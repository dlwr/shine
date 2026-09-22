import {type Environment} from '@shine/database';
import {
  EdgeCache,
  getCacheKeyForSelection,
  getCacheTTL,
  IMPORTED_DATA_EDGE_TTL,
  normalizeCacheLocale,
} from '../utils/cache';
import {BaseService} from './base-service';
import {
  getDateSeed,
  getSelectionDate,
  nextSelectionDates,
  type SelectionType,
} from './selection-dates';
import {loadSelectionMovie} from './selection-movie';
import {
  deleteSelection,
  findSelectedMovieUid,
  pickSelectionMovieUid,
} from './selection-store';
import type {DateSeedOptions, MovieSelection} from '../types/movies';
import type {SelectionsResponse} from '../types/responses';

type PeriodPreview = {date: string; movie?: MovieSelection};

export class SelectionsService extends BaseService {
  private readonly cache: EdgeCache;

  constructor(
    environment: Environment,
    cache = new EdgeCache(undefined, environment.CACHE_KV),
  ) {
    super(environment);
    this.cache = cache;
  }

  async getDateSeededSelections(
    options: DateSeedOptions,
  ): Promise<SelectionsResponse> {
    const {locale, date = new Date()} = options;

    const [daily, weekly, monthly] = await Promise.all([
      this.getSelection(date, 'daily', locale),
      this.getSelection(date, 'weekly', locale),
      this.getSelection(date, 'monthly', locale),
    ]);

    return {daily, weekly, monthly};
  }

  async getNextPeriodPreviews(locale: string): Promise<{
    nextDaily: PeriodPreview;
    nextWeekly: PeriodPreview;
    nextMonthly: PeriodPreview;
  }> {
    const next = nextSelectionDates(new Date());

    const [daily, weekly, monthly] = await Promise.all([
      this.getSelection(next.daily, 'daily', locale),
      this.getSelection(next.weekly, 'weekly', locale),
      this.getSelection(next.monthly, 'monthly', locale),
    ]);

    return {
      nextDaily: {date: getSelectionDate(next.daily, 'daily'), movie: daily},
      nextWeekly: {
        date: getSelectionDate(next.weekly, 'weekly'),
        movie: weekly,
      },
      nextMonthly: {
        date: getSelectionDate(next.monthly, 'monthly'),
        movie: monthly,
      },
    };
  }

  private async getSelection(
    date: Date,
    type: SelectionType,
    locale: string,
  ): Promise<MovieSelection> {
    const selectionDate = getSelectionDate(date, type);
    const cacheLocale = normalizeCacheLocale(locale);
    const cacheKey = cacheLocale
      ? getCacheKeyForSelection(type, selectionDate, cacheLocale)
      : undefined;

    const cached = cacheKey
      ? await this.cache.get(cacheKey, {edgeTtl: IMPORTED_DATA_EDGE_TTL})
      : undefined;
    if (cached?.data) {
      return cached.data as MovieSelection;
    }

    let movieId = await findSelectedMovieUid(
      this.database,
      type,
      selectionDate,
    );
    if (!movieId) {
      const selectedMovie = await this.generateSelection(date, type, locale);
      if (!selectedMovie) {
        throw new Error('No movies available for selection');
      }

      movieId = selectedMovie.uid;
    }

    let movie: MovieSelection;
    try {
      movie = await loadSelectionMovie(this.database, movieId, locale);
    } catch (error) {
      if (error instanceof Error && error.message === 'Movie not found') {
        console.warn(
          `Selection movie ${movieId} for ${type} ${selectionDate} missing or deleted. Reselecting...`,
        );
        await deleteSelection(this.database, type, selectionDate);
        const regenerated = await this.generateSelection(date, type, locale);
        if (!regenerated) {
          throw new Error('No movies available for selection', {cause: error});
        }

        movie = regenerated;
      } else {
        throw error;
      }
    }

    if (cacheKey) {
      await this.cache.set(cacheKey, movie, getCacheTTL.selections[type]);
    }

    return movie;
  }

  private async generateSelection(
    date: Date,
    type: SelectionType,
    locale: string,
  ): Promise<MovieSelection | undefined> {
    const movieUid = await pickSelectionMovieUid(
      this.database,
      date,
      type,
      getDateSeed(date, type),
      {persist: true},
    );
    if (!movieUid) {
      return undefined;
    }

    return loadSelectionMovie(this.database, movieUid, locale);
  }
}
