import {and, eq, inArray, isNull, type Environment} from '@shine/database';
import {movieSelections} from '@shine/database/schema/movie-selections';
import {movies} from '@shine/database/schema/movies';
import {
  CACHEABLE_LOCALES,
  EdgeCache,
  getCacheKeyForSelection,
  getCacheKeyForSelectionHistory,
  getCacheTTL,
  normalizeCacheLocale,
} from '../utils/cache';
import {BaseService} from './base-service';
import {
  getSelectionDate,
  SELECTION_TYPES,
  type SelectionType,
} from './selection-dates';
import {loadSelectionMovie} from './selection-movie';
import {
  deleteSelection,
  deleteSelectionsAfter,
  pickSelectionMovieUid,
} from './selection-store';
import type {MovieSelection} from '../types/movies';

export class AdminSelectionsService extends BaseService {
  private readonly cache: EdgeCache;

  constructor(
    environment: Environment,
    cache = new EdgeCache(undefined, environment.CACHE_KV),
  ) {
    super(environment);
    this.cache = cache;
  }

  async reselectMovie(
    type: SelectionType,
    locale: string,
    date = new Date(),
    excludeMovieUids: string[] = [],
  ): Promise<MovieSelection> {
    const selectionDate = getSelectionDate(date, type);

    await deleteSelection(this.database, type, selectionDate);
    await this.purgeSelectionCache(type, selectionDate);

    const movieUid = await pickSelectionMovieUid(
      this.database,
      date,
      type,
      'random',
      {persist: true, excludeMovieUids},
    );
    if (!movieUid) {
      throw new Error('No movies available for selection');
    }

    const movie = await loadSelectionMovie(this.database, movieUid, locale);

    const cacheLocale = normalizeCacheLocale(locale);
    if (cacheLocale) {
      await this.cache.set(
        getCacheKeyForSelection(type, selectionDate, cacheLocale),
        movie,
        getCacheTTL.selections[type],
      );
    }

    return movie;
  }

  async overrideSelection(
    type: SelectionType,
    movieId: string,
    date = new Date(),
  ): Promise<void> {
    const selectionDate = getSelectionDate(date, type);

    const movieExists = await this.database
      .select({uid: movies.uid})
      .from(movies)
      .where(and(eq(movies.uid, movieId), isNull(movies.deletedAt)))
      .limit(1);

    if (movieExists.length === 0) {
      throw new Error('Movie not found');
    }

    await deleteSelection(this.database, type, selectionDate);
    await this.database.insert(movieSelections).values({
      movieId,
      selectionType: type,
      selectionDate,
      createdAt: Math.floor(Date.now() / 1000),
    });

    await this.purgeSelectionCache(type, selectionDate);
  }

  async deleteFutureSelections(now = new Date()): Promise<{
    currentDates: Record<SelectionType, string>;
    deletedCount: Record<SelectionType, number>;
  }> {
    const currentDates = {
      daily: getSelectionDate(now, 'daily'),
      weekly: getSelectionDate(now, 'weekly'),
      monthly: getSelectionDate(now, 'monthly'),
    };

    const daily = await deleteSelectionsAfter(
      this.database,
      'daily',
      currentDates.daily,
    );
    const weekly = await deleteSelectionsAfter(
      this.database,
      'weekly',
      currentDates.weekly,
    );
    const monthly = await deleteSelectionsAfter(
      this.database,
      'monthly',
      currentDates.monthly,
    );

    return {currentDates, deletedCount: {daily, weekly, monthly}};
  }

  async purgeSelectionCachesForMovie(
    movieUid: string,
    date = new Date(),
  ): Promise<void> {
    const current = await this.database
      .select({
        selectionType: movieSelections.selectionType,
        selectionDate: movieSelections.selectionDate,
      })
      .from(movieSelections)
      .where(
        and(
          eq(movieSelections.movieId, movieUid),
          inArray(
            movieSelections.selectionDate,
            SELECTION_TYPES.map(type => getSelectionDate(date, type)),
          ),
        ),
      );

    await Promise.all(
      current
        .filter(
          selection =>
            selection.selectionDate ===
            getSelectionDate(date, selection.selectionType),
        )
        .map(async selection =>
          this.purgeSelectionCache(
            selection.selectionType,
            selection.selectionDate,
          ),
        ),
    );
  }

  private async purgeSelectionCache(
    type: SelectionType,
    selectionDate: string,
  ): Promise<void> {
    const historyDate = getSelectionDate(new Date(), type);
    await Promise.all(
      CACHEABLE_LOCALES.flatMap(locale => [
        this.cache.delete(getCacheKeyForSelection(type, selectionDate, locale)),
        this.cache.delete(
          getCacheKeyForSelectionHistory(type, historyDate, locale),
        ),
      ]),
    );
  }
}
