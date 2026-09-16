import {and, eq, inArray, isNull, type Environment} from '@shine/database';
import {movieSelections} from '@shine/database/schema/movie-selections';
import {movies} from '@shine/database/schema/movies';
import {
  CACHEABLE_LOCALES,
  EdgeCache,
  getCacheKeyForSelection,
  getCacheKeyForSelectionHistory,
  getCacheTTL,
  IMPORTED_DATA_EDGE_TTL,
  normalizeCacheLocale,
} from '../utils/cache';
import {BaseService} from './base-service';
import {
  getDateSeed,
  getSelectionDate,
  type SelectionType,
} from './selection-dates';
import {loadSelectionMovie} from './selection-movie';
import {pickNominatedMovieUid} from './selection-pick';
import type {DateSeedOptions, MovieSelection} from '../types/services';

export class SelectionsService extends BaseService {
  private readonly cache: EdgeCache;

  constructor(
    environment: Environment,
    cache = new EdgeCache(undefined, environment.CACHE_KV),
  ) {
    super(environment);
    this.cache = cache;
  }

  async getDateSeededSelections(options: DateSeedOptions): Promise<{
    daily: MovieSelection;
    weekly: MovieSelection;
    monthly: MovieSelection;
  }> {
    const {locale, date = new Date()} = options;

    const [dailyMovie, weeklyMovie, monthlyMovie] = await Promise.all([
      this.getMovieByDateSeed(date, 'daily', locale),
      this.getMovieByDateSeed(date, 'weekly', locale),
      this.getMovieByDateSeed(date, 'monthly', locale),
    ]);

    return {
      daily: dailyMovie,
      weekly: weeklyMovie,
      monthly: monthlyMovie,
    };
  }

  async reselectMovie(
    type: SelectionType,
    locale: string,
    date = new Date(),
    excludeMovieUids: string[] = [],
  ): Promise<MovieSelection> {
    const selectionDate = getSelectionDate(date, type);

    // Delete existing selection
    await this.database
      .delete(movieSelections)
      .where(
        and(
          eq(movieSelections.selectionType, type),
          eq(movieSelections.selectionDate, selectionDate),
        ),
      );

    // Clear cache
    await this.purgeSelectionCache(type, selectionDate);

    // Generate new selection with randomness
    const movieUid = await this.selectMovieFromNominations(
      date,
      type,
      true,
      'random',
      excludeMovieUids,
    );
    if (!movieUid) {
      throw new Error('No movies available for selection');
    }

    // Get complete movie data and cache it
    const movie = await loadSelectionMovie(this.database, movieUid, locale);

    // Cache result
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

  async previewSelections(
    type: SelectionType,
    locale: string,
    futureDate: Date,
  ): Promise<MovieSelection[]> {
    const baseDate = new Date(futureDate);
    const promises: Array<Promise<MovieSelection | undefined>> = [];

    for (let index = 0; index < 7; index++) {
      const previewDate = new Date(baseDate);

      if (type === 'daily') {
        previewDate.setDate(baseDate.getDate() + index);
      } else if (type === 'weekly') {
        previewDate.setDate(baseDate.getDate() + index * 7);
      } else {
        previewDate.setMonth(baseDate.getMonth() + index);
      }

      promises.push(
        this.generateMovieSelection(previewDate, type, locale, false),
      );
    }

    const results = await Promise.all(promises);
    return results.filter(
      (movie): movie is MovieSelection => movie !== undefined,
    );
  }

  async getNextPeriodPreviews(locale: string): Promise<{
    nextDaily: {date: string; movie?: MovieSelection};
    nextWeekly: {date: string; movie?: MovieSelection};
    nextMonthly: {date: string; movie?: MovieSelection};
  }> {
    const now = new Date();
    console.log(
      '🔍 Getting next period previews for locale:',
      locale,
      'at',
      now.toISOString(),
    );

    // Calculate next dates
    const nextDay = new Date(now);
    nextDay.setDate(now.getDate() + 1);

    const daysSinceFriday = (now.getDay() - 5 + 7) % 7;
    const fridayDate = new Date(now);
    fridayDate.setDate(now.getDate() - daysSinceFriday);
    const nextFriday = new Date(fridayDate);
    nextFriday.setDate(fridayDate.getDate() + 7);

    const nextMonth = new Date(now);
    nextMonth.setDate(1); // Must set date to 1 BEFORE incrementing month to avoid overflow (e.g., Jan 30 + 1 month = Mar 2, not Feb)
    nextMonth.setMonth(now.getMonth() + 1);

    const nextDates = {
      daily: getSelectionDate(nextDay, 'daily'),
      weekly: getSelectionDate(nextFriday, 'weekly'),
      monthly: getSelectionDate(nextMonth, 'monthly'),
    };

    console.log('📅 Next dates calculated:', nextDates);

    // Get next period selections - use existing if available, otherwise generate preview
    const [nextDailyMovie, nextWeeklyMovie, nextMonthlyMovie] =
      await Promise.all([
        this.getMovieByDateSeed(nextDay, 'daily', locale),
        this.getMovieByDateSeed(nextFriday, 'weekly', locale),
        this.getMovieByDateSeed(nextMonth, 'monthly', locale),
      ]);

    console.log('🎬 Generated movie selections:', {
      daily: nextDailyMovie?.title || 'No movie',
      weekly: nextWeeklyMovie?.title || 'No movie',
      monthly: nextMonthlyMovie?.title || 'No movie',
    });

    const result = {
      nextDaily: {
        date: nextDates.daily,
        movie: nextDailyMovie,
      },
      nextWeekly: {
        date: nextDates.weekly,
        movie: nextWeeklyMovie,
      },
      nextMonthly: {
        date: nextDates.monthly,
        movie: nextMonthlyMovie,
      },
    };

    console.log(
      '✅ Final preview result:',
      JSON.stringify(result, undefined, 2),
    );
    return result;
  }

  async overrideSelection(
    type: SelectionType,
    movieId: string,
    date = new Date(),
  ): Promise<void> {
    const selectionDate = getSelectionDate(date, type);

    // Check if movie exists
    const movieExists = await this.database
      .select({uid: movies.uid})
      .from(movies)
      .where(and(eq(movies.uid, movieId), isNull(movies.deletedAt)))
      .limit(1);

    if (movieExists.length === 0) {
      throw new Error('Movie not found');
    }

    // Delete existing selection
    await this.database
      .delete(movieSelections)
      .where(
        and(
          eq(movieSelections.selectionType, type),
          eq(movieSelections.selectionDate, selectionDate),
        ),
      );

    // Insert override selection
    await this.database.insert(movieSelections).values({
      movieId,
      selectionType: type,
      selectionDate,
      createdAt: Math.floor(Date.now() / 1000),
    });

    // Clear cache
    await this.purgeSelectionCache(type, selectionDate);
  }

  async purgeSelectionCachesForMovie(
    movieUid: string,
    date = new Date(),
  ): Promise<void> {
    const types: SelectionType[] = ['daily', 'weekly', 'monthly'];
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
            types.map(type => getSelectionDate(date, type)),
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

  private async getMovieByDateSeed(
    date: Date,
    type: SelectionType,
    locale: string,
  ): Promise<MovieSelection> {
    const selectionDate = getSelectionDate(date, type);
    const cacheLocale = normalizeCacheLocale(locale);
    const cacheKey = cacheLocale
      ? getCacheKeyForSelection(type, selectionDate, cacheLocale)
      : undefined;

    // Try to get cached result
    const cached = cacheKey
      ? await this.cache.get(cacheKey, {edgeTtl: IMPORTED_DATA_EDGE_TTL})
      : undefined;
    if (cached?.data) {
      return cached.data as MovieSelection;
    }

    // Check for existing selection in database
    const existingSelection = await this.database
      .select({movieId: movieSelections.movieId})
      .from(movieSelections)
      .where(
        and(
          eq(movieSelections.selectionType, type),
          eq(movieSelections.selectionDate, selectionDate),
        ),
      )
      .limit(1);

    let movieId: string;

    if (existingSelection.length > 0) {
      movieId = existingSelection[0].movieId;
    } else {
      // Generate new selection
      const selectedMovie = await this.generateMovieSelection(
        date,
        type,
        locale,
        true,
      );
      if (!selectedMovie) {
        throw new Error('No movies available for selection');
      }

      movieId = selectedMovie.uid;
    }

    // Get complete movie data
    let movie: MovieSelection;
    try {
      movie = await loadSelectionMovie(this.database, movieId, locale);
    } catch (error) {
      if (error instanceof Error && error.message === 'Movie not found') {
        console.warn(
          `Selection movie ${movieId} for ${type} ${selectionDate} missing or deleted. Reselecting...`,
        );
        await this.database
          .delete(movieSelections)
          .where(
            and(
              eq(movieSelections.selectionType, type),
              eq(movieSelections.selectionDate, selectionDate),
            ),
          );
        const regenerated = await this.generateMovieSelection(
          date,
          type,
          locale,
          true,
        );
        if (!regenerated) {
          throw new Error('No movies available for selection', {cause: error});
        }
        movie = regenerated;
      } else {
        throw error;
      }
    }

    // Cache result
    if (cacheKey) {
      await this.cache.set(cacheKey, movie, getCacheTTL.selections[type]);
    }

    return movie;
  }

  private async generateMovieSelection(
    date: Date,
    type: SelectionType,
    locale: string,
    shouldPersistSelection: boolean,
  ): Promise<MovieSelection | undefined> {
    const seed = getDateSeed(date, type);
    const movieUid = await this.selectMovieFromNominations(
      date,
      type,
      shouldPersistSelection,
      seed,
    );
    if (!movieUid) {
      return undefined;
    }

    return loadSelectionMovie(this.database, movieUid, locale);
  }

  private async selectMovieFromNominations(
    date: Date,
    type: SelectionType,
    shouldPersistSelection: boolean,
    seed: number | 'random',
    excludeMovieUids: string[] = [],
  ): Promise<string | undefined> {
    const selectedMovieUid = await pickNominatedMovieUid(
      this.database,
      seed,
      excludeMovieUids,
    );

    if (selectedMovieUid && shouldPersistSelection) {
      await this.database
        .insert(movieSelections)
        .values({
          movieId: selectedMovieUid,
          selectionType: type,
          selectionDate: getSelectionDate(date, type),
          createdAt: Math.floor(Date.now() / 1000),
        })
        .onConflictDoNothing({
          target: [
            movieSelections.selectionType,
            movieSelections.selectionDate,
          ],
        });
    }

    return selectedMovieUid;
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
