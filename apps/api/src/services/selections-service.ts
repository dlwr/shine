import {and, eq, isNull, sql} from '@shine/database';
import {articleLinks} from '@shine/database/schema/article-links';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movieSelections} from '@shine/database/schema/movie-selections';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {posterUrls} from '@shine/database/schema/poster-urls';
import {translations} from '@shine/database/schema/translations';
import {EdgeCache} from '../utils/cache';
import {BaseService} from './base-service';
import type {DateSeedOptions, MovieSelection} from '@shine/types';

type SelectionType = 'daily' | 'weekly' | 'monthly';

export class SelectionsService extends BaseService {
  private readonly cache = new EdgeCache();

  async getDateSeededSelections(options: DateSeedOptions): Promise<{
    daily: MovieSelection;
    weekly: MovieSelection;
    monthly: MovieSelection;
  }> {
    const {locale, date = new Date()} = options;

    const dailyMovie = await this.getMovieByDateSeed(date, 'daily', locale);
    const weeklyMovie = await this.getMovieByDateSeed(date, 'weekly', locale);
    const monthlyMovie = await this.getMovieByDateSeed(date, 'monthly', locale);

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
  ): Promise<MovieSelection> {
    const selectionDate = this.getSelectionDate(date, type);

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
    await this.cache.delete(`selection-${type}-${selectionDate}`);

    // Generate new selection with randomness
    const movieUid = await this.selectMovieFromNominations(
      date,
      type,
      true,
      'random',
    );
    if (!movieUid) {
      throw new Error('No movies available for selection');
    }

    // Get complete movie data and cache it
    const movie = await this.getCompleteMovieData(movieUid, locale);

    // Cache result
    const cacheKey = `selection-${type}-${selectionDate}`;
    const response = Response.json(movie, {
      headers: {'Content-Type': 'application/json'},
    });
    await this.cache.put(cacheKey, response);

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
      daily: this.getSelectionDate(nextDay, 'daily'),
      weekly: this.getSelectionDate(nextFriday, 'weekly'),
      monthly: this.getSelectionDate(nextMonth, 'monthly'),
    };

    console.log('📅 Next dates calculated:', nextDates);

    // Check cache first for preview results
    const cacheKey = `preview-selections-${locale}-${nextDates.daily}-${nextDates.weekly}-${nextDates.monthly}`;
    const cachedResult = await this.cache.get(cacheKey);

    if (cachedResult?.data) {
      console.log('💾 Using cached preview results');
      return cachedResult.data as {
        nextDaily: {date: string; movie?: MovieSelection | undefined};
        nextWeekly: {date: string; movie?: MovieSelection | undefined};
        nextMonthly: {date: string; movie?: MovieSelection | undefined};
      };
    }

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

    // Cache the preview results for 10 minutes
    await this.cache.set(cacheKey, result, 600); // 10 minutes TTL

    console.log(
      '✅ Final preview result (cached):',
      JSON.stringify(result, undefined, 2),
    );
    return result;
  }

  async overrideSelection(
    type: SelectionType,
    movieId: string,
    date = new Date(),
  ): Promise<void> {
    const selectionDate = this.getSelectionDate(date, type);

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
      updatedAt: Math.floor(Date.now() / 1000),
    });

    // Clear cache
    await this.cache.delete(`selection-${type}-${selectionDate}`);
  }

  private async getMovieByDateSeed(
    date: Date,
    type: SelectionType,
    locale: string,
  ): Promise<MovieSelection> {
    const selectionDate = this.getSelectionDate(date, type);
    const cacheKey = `selection-${type}-${selectionDate}`;

    // Try to get cached result
    const cached = await this.cache.get(cacheKey);
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
      movie = await this.getCompleteMovieData(movieId, locale);
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
    const response = Response.json(movie, {
      headers: {'Content-Type': 'application/json'},
    });
    await this.cache.put(cacheKey, response);

    return movie;
  }

  private async generateMovieSelection(
    date: Date,
    type: SelectionType,
    locale: string,
    persistSelection: boolean,
  ): Promise<MovieSelection | undefined> {
    const seed = this.getDateSeed(date, type);
    const movieUid = await this.selectMovieFromNominations(
      date,
      type,
      persistSelection,
      seed,
    );
    if (!movieUid) {
      return undefined;
    }

    return this.getCompleteMovieData(movieUid, locale);
  }

  private async getCompleteMovieData(
    movieId: string,
    locale: string,
  ): Promise<MovieSelection> {
    // Get movie basic data
    const movieResult = await this.database
      .select({
        uid: movies.uid,
        year: movies.year,
        originalLanguage: movies.originalLanguage,
        imdbId: movies.imdbId,
        tmdbId: movies.tmdbId,
      })
      .from(movies)
      .where(and(eq(movies.uid, movieId), isNull(movies.deletedAt)))
      .limit(1);

    if (movieResult.length === 0) {
      throw new Error('Movie not found');
    }

    const movie = movieResult[0];

    // Get all translations for the movie
    const allTranslations = await this.database
      .select({
        languageCode: translations.languageCode,
        content: translations.content,
        isDefault: translations.isDefault,
        resourceType: translations.resourceType,
      })
      .from(translations)
      .where(
        and(
          eq(translations.resourceUid, movieId),
          eq(translations.resourceType, 'movie_title'),
        ),
      );

    const selectedTitle = this.resolveTitle(allTranslations, locale);

    // Get description for the locale
    const descriptionResult = await this.database
      .select({
        content: translations.content,
      })
      .from(translations)
      .where(
        and(
          eq(translations.resourceUid, movieId),
          eq(translations.resourceType, 'movie_description'),
          eq(translations.languageCode, locale),
        ),
      )
      .limit(1);

    const description = descriptionResult[0]?.content || undefined;

    // Get nominations
    const nominationsData = await this.database
      .select({
        nominationUid: nominations.uid,
        isWinner: nominations.isWinner,
        specialMention: nominations.specialMention,
        categoryUid: awardCategories.uid,
        categoryName: awardCategories.name,
        ceremonyUid: awardCeremonies.uid,
        ceremonyNumber: awardCeremonies.ceremonyNumber,
        ceremonyYear: awardCeremonies.year,
        organizationUid: awardOrganizations.uid,
        organizationName: awardOrganizations.name,
        organizationShortName: awardOrganizations.shortName,
      })
      .from(nominations)
      .innerJoin(
        awardCategories,
        eq(awardCategories.uid, nominations.categoryUid),
      )
      .innerJoin(
        awardCeremonies,
        eq(awardCeremonies.uid, nominations.ceremonyUid),
      )
      .innerJoin(
        awardOrganizations,
        eq(awardOrganizations.uid, awardCeremonies.organizationUid),
      )
      .where(eq(nominations.movieUid, movieId))
      .orderBy(awardCeremonies.year, awardCategories.name);

    // Get all posters for this movie
    const posters = await this.database
      .select({
        url: posterUrls.url,
        languageCode: posterUrls.languageCode,
        isPrimary: posterUrls.isPrimary,
      })
      .from(posterUrls)
      .where(eq(posterUrls.movieUid, movieId))
      .orderBy(sql`${posterUrls.isPrimary} DESC, ${posterUrls.createdAt} ASC`);

    // Get article links
    const topArticles = await this.database
      .select({
        uid: articleLinks.uid,
        url: articleLinks.url,
        title: articleLinks.title,
        description: articleLinks.description || undefined,
      })
      .from(articleLinks)
      .where(
        and(
          eq(articleLinks.movieUid, movieId),
          eq(articleLinks.isSpam, false),
          eq(articleLinks.isFlagged, false),
        ),
      )
      .orderBy(sql`${articleLinks.submittedAt} DESC`)
      .limit(3);

    // Generate IMDb URL if IMDb ID exists
    const imdbUrl = movie.imdbId
      ? `https://www.imdb.com/title/${movie.imdbId}/`
      : undefined;

    return {
      uid: movie.uid,
      year: movie.year ?? 0,
      originalLanguage: movie.originalLanguage,
      imdbId: movie.imdbId ?? undefined,
      tmdbId: movie.tmdbId ?? undefined,
      title: selectedTitle || `Unknown Title (${movie.year})`,
      description: description || undefined,
      posterUrls: posters.map(p => ({
        url: p.url,
        languageCode: p.languageCode ?? undefined,
        isPrimary: p.isPrimary ?? 0,
      })),
      imdbUrl,
      nominations: nominationsData.map(nom => ({
        uid: nom.nominationUid,
        isWinner: Boolean(nom.isWinner),
        specialMention: nom.specialMention ?? undefined,
        category: {
          uid: nom.categoryUid,
          name: nom.categoryName,
        },
        ceremony: {
          uid: nom.ceremonyUid,
          number: nom.ceremonyNumber ?? undefined,
          year: nom.ceremonyYear,
        },
        organization: {
          uid: nom.organizationUid,
          name: nom.organizationName,
          shortName: nom.organizationShortName ?? undefined,
        },
      })),
      articleLinks: topArticles.map(article => ({
        uid: article.uid,
        url: article.url,
        title: article.title,
        description: article.description || undefined,
      })),
    };
  }

  private resolveTitle(
    allTranslations: Array<{
      languageCode: string;
      content: string;
      isDefault: number | null;
    }>,
    locale: string,
  ): string | undefined {
    const languageCode = locale.split('-')[0];

    // Priority-ordered list of matchers: locale match, default, Japanese, English
    const matchers: Array<
      (t: {languageCode: string; isDefault: number | null}) => boolean
    > = [
      t => t.languageCode === languageCode,
      t => t.isDefault === 1,
      t => t.languageCode === 'ja',
      t => t.languageCode === 'en',
    ];

    for (const matcher of matchers) {
      const match = allTranslations.find(t => matcher(t));
      if (match) {
        return match.content;
      }
    }

    // Fallback: first available translation
    return allTranslations[0]?.content;
  }

  private simpleHash(input: string): number {
    let hash = 2_166_136_261; // FNV offset basis
    for (let index = 0; index < input.length; index++) {
      const char = input.codePointAt(index) || 0;
      hash ^= char;
      hash = Math.imul(hash, 16_777_619); // FNV prime
    }

    // Avalanche finalizer: spread bits more evenly
    hash ^= hash >>> 16;
    hash = Math.imul(hash, 2_246_822_507);
    hash ^= hash >>> 13;
    hash = Math.imul(hash, 3_266_489_909);
    hash ^= hash >>> 16;

    return Math.abs(Math.trunc(hash));
  }

  private getSelectionDate(date: Date, type: SelectionType): string {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();

    switch (type) {
      case 'daily': {
        return `${year}-${month.toString().padStart(2, '0')}-${day
          .toString()
          .padStart(2, '0')}`;
      }

      case 'weekly': {
        const daysSinceFriday = (date.getDay() - 5 + 7) % 7;
        const fridayDate = new Date(date);
        fridayDate.setDate(day - daysSinceFriday);
        return `${fridayDate.getFullYear()}-${(fridayDate.getMonth() + 1)
          .toString()
          .padStart(2, '0')}-${fridayDate
          .getDate()
          .toString()
          .padStart(2, '0')}`;
      }

      case 'monthly': {
        return `${year}-${month.toString().padStart(2, '0')}-01`;
      }
    }
  }

  private getDateSeed(date: Date, type: SelectionType): number {
    const selectionDate = this.getSelectionDate(date, type);
    return this.simpleHash(`${type}-${selectionDate}`);
  }

  private async selectMovieFromNominations(
    date: Date,
    type: SelectionType,
    persistSelection: boolean,
    seed: number | 'random',
  ): Promise<string | undefined> {
    // Movies with more nominations have proportionally higher chance of being selected
    const availableNominations = await this.database
      .select({
        nominationUid: nominations.uid,
        movieUid: nominations.movieUid,
      })
      .from(nominations)
      .innerJoin(movies, eq(movies.uid, nominations.movieUid))
      .where(isNull(movies.deletedAt))
      .orderBy(nominations.movieUid, nominations.uid);

    if (availableNominations.length === 0) {
      return undefined;
    }

    const selectedIndex =
      seed === 'random'
        ? Math.floor(Math.random() * availableNominations.length)
        : seed % availableNominations.length;

    const selectedMovieUid = availableNominations[selectedIndex].movieUid;

    if (persistSelection) {
      const selectionDate = this.getSelectionDate(date, type);

      try {
        await this.database.insert(movieSelections).values({
          movieId: selectedMovieUid,
          selectionType: type,
          selectionDate,
          createdAt: Math.floor(Date.now() / 1000),
          updatedAt: Math.floor(Date.now() / 1000),
        });
      } catch {
        // Selection might already exist due to race condition, ignore
      }
    }

    return selectedMovieUid;
  }
}
