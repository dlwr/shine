import { and, eq, like, sql } from "db";
import { awardCategories } from "db/schema/award-categories";
import { awardCeremonies } from "db/schema/award-ceremonies";
import { awardOrganizations } from "db/schema/award-organizations";
import { movies } from "db/schema/movies";
import { nominations } from "db/schema/nominations";
import { translations } from "db/schema/translations";
import { EdgeCache, getCacheKeyForMovie } from "../utils/cache";
import { BaseService } from "./base-service";
import type { MovieSelection, SearchOptions } from "./types";

export class MoviesService extends BaseService {
  private cache = new EdgeCache();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private executeQuery(query: any): any {
    return query;
  }

  async searchMovies(options: SearchOptions) {
    const { page, limit, query, year, language, hasAwards } = options;
    const offset = (page - 1) * limit;

    // Build search conditions
    const conditions = [];

    if (query) {
      conditions.push(like(translations.content, `%${query}%`));
    }

    if (year && !Number.isNaN(Number(year))) {
      conditions.push(eq(movies.year, Number(year)));
    }

    if (language) {
      conditions.push(eq(movies.originalLanguage, language));
    }

    // Base query with movie and translation data
    const baseQuery = this.database
      .select({
        uid: movies.uid,
        year: movies.year,
        originalLanguage: movies.originalLanguage,
        imdbId: movies.imdbId,
        title: translations.content,
        posterUrl: sql`
          (
            SELECT url
            FROM poster_urls
            WHERE poster_urls.movie_uid = movies.uid
            ORDER BY poster_urls.is_primary DESC, poster_urls.created_at ASC
            LIMIT 1
          )
        `.as("posterUrl"),
        hasNominations: sql`
          (
            SELECT COUNT(*) > 0
            FROM nominations
            WHERE nominations.movie_uid = movies.uid
          )
        `.as("hasNominations"),
      })
      .from(movies)
      .leftJoin(
        translations,
        and(
          eq(translations.resourceUid, movies.uid),
          eq(translations.resourceType, "movie_title"),
          eq(translations.languageCode, "ja"),
        ),
      );

    // Build final query with conditions - using unknown type for complex Drizzle types
    let finalQuery: unknown = baseQuery;

    if (String(hasAwards) === "true") {
      // Join nominations for awards filter
      finalQuery = this.executeQuery(finalQuery).innerJoin(
        nominations,
        eq(nominations.movieUid, movies.uid),
      );

      if (conditions.length > 0) {
        finalQuery = this.executeQuery(finalQuery).where(and(...conditions));
      }

      finalQuery = this.executeQuery(finalQuery).groupBy(
        movies.uid,
        translations.content,
      );
    } else if (conditions.length > 0) {
      finalQuery = this.executeQuery(finalQuery).where(and(...conditions));
    }

    // Get movies with pagination
    const searchResults = await this.executeQuery(finalQuery)
      .orderBy(movies.year, movies.uid)
      .limit(limit)
      .offset(offset);

    // Get total count with simple separate query
    const baseCountQuery = this.database
      .select({ count: sql`COUNT(DISTINCT movies.uid)`.as("count") })
      .from(movies)
      .leftJoin(
        translations,
        and(
          eq(translations.resourceUid, movies.uid),
          eq(translations.resourceType, "movie_title"),
          eq(translations.languageCode, "ja"),
        ),
      );

    // Use unknown type for count query
    let countQuery: unknown = baseCountQuery;

    if (String(hasAwards) === "true") {
      countQuery = this.executeQuery(countQuery).innerJoin(
        nominations,
        eq(nominations.movieUid, movies.uid),
      );
    }

    if (conditions.length > 0) {
      countQuery = this.executeQuery(countQuery).where(and(...conditions));
    }

    const totalCountResult = await this.executeQuery(countQuery);
    const totalCount = Number(totalCountResult[0]?.count) || 0;
    const totalPages = Math.ceil(totalCount / limit);

    return {
      movies: searchResults.map(
        (movie: {
          uid: string;
          year: number | null;
          originalLanguage: string;
          imdbId: string | null;
          title: string | null;
          posterUrl: unknown;
          hasNominations: unknown;
        }) => ({
          uid: movie.uid,
          year: movie.year ?? 0,
          originalLanguage: movie.originalLanguage,
          imdbId: movie.imdbId,
          title: movie.title || `Unknown Title (${movie.year})`,
          posterUrl: movie.posterUrl,
          hasNominations: Boolean(movie.hasNominations),
        }),
      ),
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  async getMovieDetails(
    movieId: string,
    locale = "ja",
  ): Promise<MovieSelection> {
    const cacheKey = getCacheKeyForMovie(movieId);

    // Try to get cached result
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      const text = await cached.text();
      return JSON.parse(text) as MovieSelection;
    }

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

    const movieDetails: MovieSelection = {
      uid: movie.uid,
      year: movie.year ?? 0,
      originalLanguage: movie.originalLanguage,
      imdbId: movie.imdbId,
      tmdbId: movie.tmdbId,
      title: movie.title || `Unknown Title (${movie.year})`,
      description: (movie.description as string) || undefined,
      posterUrl: (movie.posterUrl as string) || undefined,
      nominations: nominationsData.map(
        (nom: {
          nominationUid: string;
          isWinner: number;
          specialMention: string | null;
          categoryName: string;
          ceremonyYear: number;
          organizationName: string;
          organizationShortName: string | null;
        }) => ({
          uid: nom.nominationUid,
          year: nom.ceremonyYear,
          isWinner: Boolean(nom.isWinner),
          category: nom.categoryName,
          organization: nom.organizationShortName || nom.organizationName,
          ceremony: `${nom.organizationShortName || nom.organizationName} ${nom.ceremonyYear}`,
        }),
      ),
    };

    // Cache result
    const response = new Response(JSON.stringify(movieDetails), {
      headers: { "Content-Type": "application/json" },
    });
    await this.cache.put(cacheKey, response);

    return movieDetails;
  }

  async addMovieTranslation(
    movieId: string,
    languageCode: string,
    title: string,
    description?: string,
  ): Promise<void> {
    // Check if movie exists
    const movieExists = await this.database
      .select({ uid: movies.uid })
      .from(movies)
      .where(eq(movies.uid, movieId))
      .limit(1);

    if (movieExists.length === 0) {
      throw new Error("Movie not found");
    }

    await this.database.transaction(async trx => {
      // Add or update title translation
      const existingTitle = await trx
        .select({ uid: translations.uid })
        .from(translations)
        .where(
          and(
            eq(translations.resourceUid, movieId),
            eq(translations.resourceType, "movie_title"),
            eq(translations.languageCode, languageCode),
          ),
        )
        .limit(1);

      // Update existing title or insert new one
      void (existingTitle.length > 0
        ? await trx
            .update(translations)
            .set({
              content: title,
              updatedAt: Math.floor(Date.now() / 1000),
            })
            .where(eq(translations.uid, existingTitle[0].uid))
        : await trx.insert(translations).values({
            resourceType: "movie_title",
            resourceUid: movieId,
            languageCode,
            content: title,
            createdAt: Math.floor(Date.now() / 1000),
            updatedAt: Math.floor(Date.now() / 1000),
          }));

      // Add or update description translation if provided
      if (description) {
        const existingDescription = await trx
          .select({ uid: translations.uid })
          .from(translations)
          .where(
            and(
              eq(translations.resourceUid, movieId),
              eq(translations.resourceType, "movie_description"),
              eq(translations.languageCode, languageCode),
            ),
          )
          .limit(1);

        // Update existing description or insert new one
        void (existingDescription.length > 0
          ? await trx
              .update(translations)
              .set({
                content: description,
                updatedAt: Math.floor(Date.now() / 1000),
              })
              .where(eq(translations.uid, existingDescription[0].uid))
          : await trx.insert(translations).values({
              resourceType: "movie_description",
              resourceUid: movieId,
              languageCode,
              content: description,
              createdAt: Math.floor(Date.now() / 1000),
              updatedAt: Math.floor(Date.now() / 1000),
            }));
      }
    });

    // Invalidate cache
    const cacheKey = getCacheKeyForMovie(movieId);
    await this.cache.delete(cacheKey);
  }

  async deleteMovieTranslation(
    movieId: string,
    languageCode: string,
    resourceType: "movie_title" | "movie_description" = "movie_title",
  ): Promise<void> {
    await this.database
      .delete(translations)
      .where(
        and(
          eq(translations.resourceUid, movieId),
          eq(translations.resourceType, resourceType),
          eq(translations.languageCode, languageCode),
        ),
      );

    // Invalidate cache
    const cacheKey = getCacheKeyForMovie(movieId);
    await this.cache.delete(cacheKey);
  }
}
