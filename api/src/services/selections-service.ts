import { and, eq, sql } from "db";
import { awardCategories } from "db/schema/award-categories";
import { awardCeremonies } from "db/schema/award-ceremonies";
import { awardOrganizations } from "db/schema/award-organizations";
import { movieSelections } from "db/schema/movie-selections";
import { movies } from "db/schema/movies";
import { nominations } from "db/schema/nominations";
import { translations } from "db/schema/translations";
import { EdgeCache } from "../utils/cache";
import { BaseService } from "./base-service";
import type { DateSeedOptions, MovieSelection } from "./types";

export class SelectionsService extends BaseService {
  private cache = new EdgeCache();

  async getDateSeededSelections(options: DateSeedOptions): Promise<{
    daily: MovieSelection;
    weekly: MovieSelection;
    monthly: MovieSelection;
  }> {
    const { locale, date = new Date() } = options;

    const dailyMovie = await this.getMovieByDateSeed(date, "daily", locale);
    const weeklyMovie = await this.getMovieByDateSeed(date, "weekly", locale);
    const monthlyMovie = await this.getMovieByDateSeed(date, "monthly", locale);

    return {
      daily: dailyMovie,
      weekly: weeklyMovie,
      monthly: monthlyMovie,
    };
  }

  async reselectMovie(
    type: "daily" | "weekly" | "monthly",
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

    // Generate new selection
    return this.getMovieByDateSeed(date, type, locale);
  }

  async previewSelections(
    type: "daily" | "weekly" | "monthly",
    locale: string,
    futureDate: Date,
  ): Promise<MovieSelection[]> {
    const previews: MovieSelection[] = [];
    const baseDate = new Date(futureDate);

    for (let index = 0; index < 7; index++) {
      const previewDate = new Date(baseDate);

      if (type === "daily") {
        previewDate.setDate(baseDate.getDate() + index);
      } else if (type === "weekly") {
        previewDate.setDate(baseDate.getDate() + index * 7);
      } else {
        previewDate.setMonth(baseDate.getMonth() + index);
      }

      const movie = await this.generateMovieSelection(
        previewDate,
        type,
        locale,
        false,
      );
      if (movie) {
        previews.push(movie);
      }
    }

    return previews;
  }

  async getNextPeriodPreviews(locale: string): Promise<{
    nextDaily: { date: string; movie?: MovieSelection };
    nextWeekly: { date: string; movie?: MovieSelection };
    nextMonthly: { date: string; movie?: MovieSelection };
  }> {
    const now = new Date();

    // Calculate next dates
    const nextDay = new Date(now);
    nextDay.setDate(now.getDate() + 1);

    const daysSinceFriday = (now.getDay() - 5 + 7) % 7;
    const fridayDate = new Date(now);
    fridayDate.setDate(now.getDate() - daysSinceFriday);
    const nextFriday = new Date(fridayDate);
    nextFriday.setDate(fridayDate.getDate() + 7);

    const nextMonth = new Date(now);
    nextMonth.setMonth(now.getMonth() + 1);
    nextMonth.setDate(1);

    // Get next period selections (preview only - don't save to database)
    const [nextDailyMovie, nextWeeklyMovie, nextMonthlyMovie] =
      await Promise.all([
        this.generateMovieSelection(nextDay, "daily", locale, false),
        this.generateMovieSelection(nextFriday, "weekly", locale, false),
        this.generateMovieSelection(nextMonth, "monthly", locale, false),
      ]);

    return {
      nextDaily: {
        date: this.getSelectionDate(nextDay, "daily"),
        movie: nextDailyMovie,
      },
      nextWeekly: {
        date: this.getSelectionDate(nextFriday, "weekly"),
        movie: nextWeeklyMovie,
      },
      nextMonthly: {
        date: this.getSelectionDate(nextMonth, "monthly"),
        movie: nextMonthlyMovie,
      },
    };
  }

  async overrideSelection(
    type: "daily" | "weekly" | "monthly",
    movieId: string,
    date = new Date(),
  ): Promise<void> {
    const selectionDate = this.getSelectionDate(date, type);

    // Check if movie exists
    const movieExists = await this.database
      .select({ uid: movies.uid })
      .from(movies)
      .where(eq(movies.uid, movieId))
      .limit(1);

    if (movieExists.length === 0) {
      throw new Error("Movie not found");
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
      movieId: movieId,
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
    type: "daily" | "weekly" | "monthly",
    locale: string,
  ): Promise<MovieSelection> {
    const selectionDate = this.getSelectionDate(date, type);
    const cacheKey = `selection-${type}-${selectionDate}`;

    // Try to get cached result
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      const text = await cached.text();
      return JSON.parse(text) as MovieSelection;
    }

    // Check for existing selection in database
    const existingSelection = await this.database
      .select({ movieId: movieSelections.movieId })
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
        throw new Error("No movies available for selection");
      }
      movieId = selectedMovie.uid;
    }

    // Get complete movie data
    const movie = await this.getCompleteMovieData(movieId, locale);

    // Cache result
    const response = new Response(JSON.stringify(movie), {
      headers: { "Content-Type": "application/json" },
    });
    await this.cache.put(cacheKey, response);

    return movie;
  }

  private async generateMovieSelection(
    date: Date,
    type: "daily" | "weekly" | "monthly",
    locale: string,
    persistSelection: boolean,
  ): Promise<MovieSelection | undefined> {
    const seed = this.getDateSeed(date, type);

    // Get all movies with basic data for selection
    const availableMovies = await this.database
      .select({
        uid: movies.uid,
        year: movies.year,
        originalLanguage: movies.originalLanguage,
        imdbId: movies.imdbId,
        tmdbId: movies.tmdbId,
      })
      .from(movies)
      .orderBy(movies.year, movies.uid);

    if (availableMovies.length === 0) {
      return undefined;
    }

    // Use seed to select movie deterministically
    const selectedIndex = seed % availableMovies.length;
    const selectedMovieData = availableMovies[selectedIndex];

    // Persist selection if requested
    if (persistSelection) {
      const selectionDate = this.getSelectionDate(date, type);

      try {
        await this.database.insert(movieSelections).values({
          movieId: selectedMovieData.uid,
          selectionType: type,
          selectionDate,
          createdAt: Math.floor(Date.now() / 1000),
          updatedAt: Math.floor(Date.now() / 1000),
        });
      } catch {
        // Selection might already exist due to race condition, ignore
      }
    }

    // Get complete movie data
    return this.getCompleteMovieData(selectedMovieData.uid, locale);
  }

  private async getCompleteMovieData(
    movieId: string,
    locale: string,
  ): Promise<MovieSelection> {
    // Get movie with title and description
    const movieResult = await this.database
      .select({
        uid: movies.uid,
        year: movies.year,
        originalLanguage: movies.originalLanguage,
        imdbId: movies.imdbId,
        tmdbId: movies.tmdbId,
        title: translations.content,
        description: sql`
          (
            SELECT content
            FROM translations
            WHERE translations.resource_uid = movies.uid
              AND translations.resource_type = 'movie_description'
              AND translations.language_code = ${locale}
            LIMIT 1
          )
        `.as("description"),
        posterUrl: sql`
          (
            SELECT url
            FROM poster_urls
            WHERE poster_urls.movie_uid = movies.uid
            ORDER BY poster_urls.is_primary DESC, poster_urls.created_at ASC
            LIMIT 1
          )
        `.as("posterUrl"),
      })
      .from(movies)
      .leftJoin(
        translations,
        and(
          eq(translations.resourceUid, movies.uid),
          eq(translations.resourceType, "movie_title"),
          eq(translations.languageCode, locale),
        ),
      )
      .where(eq(movies.uid, movieId))
      .limit(1);

    if (movieResult.length === 0) {
      throw new Error("Movie not found");
    }

    const movie = movieResult[0];

    // Get nominations
    const nominationsData = await this.database
      .select({
        nominationUid: nominations.uid,
        isWinner: nominations.isWinner,
        specialMention: nominations.specialMention,
        categoryName: awardCategories.name,
        ceremonyYear: awardCeremonies.year,
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

    return {
      uid: movie.uid,
      year: movie.year ?? 0,
      originalLanguage: movie.originalLanguage,
      imdbId: movie.imdbId,
      tmdbId: movie.tmdbId,
      title: movie.title || `Unknown Title (${movie.year})`,
      description: (movie.description as string) || undefined,
      posterUrl: (movie.posterUrl as string) || undefined,
      nominations: nominationsData.map(nom => ({
        uid: nom.nominationUid,
        year: nom.ceremonyYear,
        isWinner: Boolean(nom.isWinner),
        category: nom.categoryName,
        organization: nom.organizationShortName || nom.organizationName,
        ceremony: `${nom.organizationShortName || nom.organizationName} ${nom.ceremonyYear}`,
      })),
    };
  }

  private simpleHash(input: string): number {
    let hash = 0;
    for (let index = 0; index < input.length; index++) {
      const char = input.codePointAt(index) || 0;
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  private getSelectionDate(
    date: Date,
    type: "daily" | "weekly" | "monthly",
  ): string {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();

    switch (type) {
      case "daily": {
        return `${year}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
      }
      case "weekly": {
        const daysSinceFriday = (date.getDay() - 5 + 7) % 7;
        const fridayDate = new Date(date);
        fridayDate.setDate(day - daysSinceFriday);
        return `${fridayDate.getFullYear()}-${(fridayDate.getMonth() + 1).toString().padStart(2, "0")}-${fridayDate.getDate().toString().padStart(2, "0")}`;
      }
      case "monthly": {
        return `${year}-${month.toString().padStart(2, "0")}-01`;
      }
    }
  }

  private getDateSeed(
    date: Date,
    type: "daily" | "weekly" | "monthly",
  ): number {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();

    switch (type) {
      case "daily": {
        const dateString = `${year}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
        return this.simpleHash(`daily-${dateString}`);
      }
      case "weekly": {
        const daysSinceFriday = (date.getDay() - 5 + 7) % 7;
        const fridayDate = new Date(date);
        fridayDate.setDate(day - daysSinceFriday);
        const weekString = `${fridayDate.getFullYear()}-${(fridayDate.getMonth() + 1).toString().padStart(2, "0")}-${fridayDate.getDate().toString().padStart(2, "0")}`;
        return this.simpleHash(`weekly-${weekString}`);
      }
      case "monthly": {
        const monthString = `${year}-${month.toString().padStart(2, "0")}`;
        return this.simpleHash(`monthly-${monthString}`);
      }
    }
  }
}
