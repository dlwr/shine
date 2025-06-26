import { and, eq, getDatabase, like, not, sql, type Environment } from "db";
import { articleLinks } from "db/schema/article-links";
import { awardCategories } from "db/schema/award-categories";
import { awardCeremonies } from "db/schema/award-ceremonies";
import { awardOrganizations } from "db/schema/award-organizations";
import { movieSelections } from "db/schema/movie-selections";
import { movies } from "db/schema/movies";
import { nominations } from "db/schema/nominations";
import { posterUrls } from "db/schema/poster-urls";
import { referenceUrls } from "db/schema/reference-urls";
import { translations } from "db/schema/translations";
import { Hono } from "hono";
import { authMiddleware } from "../auth";
import { sanitizeText } from "../middleware/sanitizer";

interface MovieDatabaseTranslation {
  iso_639_1: string;
  data?: {
    title?: string;
  };
}

export const adminRoutes = new Hono<{ Bindings: Environment }>();

// Get all movies for admin
adminRoutes.get("/movies", authMiddleware, async c => {
  try {
    const database = getDatabase(c.env as Environment);
    const page = Number(c.req.query("page") || 1);
    const limit = Math.min(Number(c.req.query("limit") || 50), 100);
    const rawSearch = c.req.query("search");
    const search = rawSearch ? sanitizeText(rawSearch) : undefined;
    const offset = (page - 1) * limit;

    // Build base query
    const baseQuery = database
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
                              LIMIT 1
                            )
        `.as("posterUrl"),
      })
      .from(movies)
      .leftJoin(
        translations,
        and(
          eq(movies.uid, translations.resourceUid),
          eq(translations.resourceType, "movie_title"),
          eq(translations.isDefault, 1),
        ),
      );

    // Apply search filter if provided
    const query = search
      ? baseQuery.where(like(translations.content, `%${search}%`))
      : baseQuery;

    // Build count query
    const baseCountQuery = database
      .select({ count: sql`count(*)`.as("count") })
      .from(movies)
      .leftJoin(
        translations,
        and(
          eq(movies.uid, translations.resourceUid),
          eq(translations.resourceType, "movie_title"),
          eq(translations.isDefault, 1),
        ),
      );

    const countQuery = search
      ? baseCountQuery.where(like(translations.content, `%${search}%`))
      : baseCountQuery;

    const [countResult, moviesResult] = await Promise.all([
      countQuery,
      query
        .orderBy(sql`${movies.createdAt} DESC`)
        .limit(limit)
        .offset(offset),
    ]);

    const totalCount = Number(countResult[0].count);

    return c.json({
      movies: moviesResult.map((movie: (typeof moviesResult)[0]) => ({
        uid: movie.uid,
        year: movie.year,
        originalLanguage: movie.originalLanguage,
        imdbId: movie.imdbId,
        title: movie.title || "Untitled",
        posterUrl: movie.posterUrl,
        imdbUrl: movie.imdbId
          ? `https://www.imdb.com/title/${movie.imdbId}/`
          : undefined,
      })),
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching movies list:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Delete movie
adminRoutes.delete("/movies/:id", authMiddleware, async c => {
  try {
    const database = getDatabase(c.env as Environment);
    const movieId = c.req.param("id");

    // Check if movie exists
    const movieExists = await database
      .select({ uid: movies.uid })
      .from(movies)
      .where(eq(movies.uid, movieId))
      .limit(1);

    if (movieExists.length === 0) {
      return c.json({ error: "Movie not found" }, 404);
    }

    // Delete all related data in proper order
    // 1. Delete article links
    await database
      .delete(articleLinks)
      .where(eq(articleLinks.movieUid, movieId));

    // 2. Delete movie selections
    await database
      .delete(movieSelections)
      .where(eq(movieSelections.movieId, movieId));

    // 3. Delete nominations
    await database.delete(nominations).where(eq(nominations.movieUid, movieId));

    // 4. Delete reference URLs
    await database
      .delete(referenceUrls)
      .where(eq(referenceUrls.movieUid, movieId));

    // 5. Delete translations
    await database
      .delete(translations)
      .where(
        and(
          eq(translations.resourceUid, movieId),
          eq(translations.resourceType, "movie_title"),
        ),
      );

    // 6. Delete poster URLs
    await database.delete(posterUrls).where(eq(posterUrls.movieUid, movieId));

    // 7. Finally delete the movie
    await database.delete(movies).where(eq(movies.uid, movieId));

    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting movie:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Flag article as spam
adminRoutes.post("/article-links/:id/spam", authMiddleware, async c => {
  try {
    const database = getDatabase(c.env as Environment);
    const articleId = c.req.param("id");

    await database
      .update(articleLinks)
      .set({ isSpam: true })
      .where(eq(articleLinks.uid, articleId));

    return c.json({ success: true });
  } catch (error) {
    console.error("Error flagging article as spam:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Add poster URL
adminRoutes.post("/movies/:id/posters", authMiddleware, async c => {
  try {
    const database = getDatabase(c.env as Environment);
    const movieId = c.req.param("id");
    const {
      url,
      width,
      height,
      languageCode,
      isPrimary = false,
    } = await c.req.json();

    // Validate inputs
    if (!url) {
      return c.json({ error: "URL is required" }, 400);
    }

    // Basic URL validation
    try {
      new URL(url);
    } catch {
      return c.json({ error: "Invalid URL format" }, 400);
    }

    // Check if movie exists
    const movieExists = await database
      .select({ uid: movies.uid })
      .from(movies)
      .where(eq(movies.uid, movieId))
      .limit(1);

    if (movieExists.length === 0) {
      return c.json({ error: "Movie not found" }, 404);
    }

    // Check if URL already exists for this movie
    const existingPoster = await database
      .select({ uid: posterUrls.uid })
      .from(posterUrls)
      .where(and(eq(posterUrls.movieUid, movieId), eq(posterUrls.url, url)))
      .limit(1);

    if (existingPoster.length > 0) {
      return c.json({ error: "Poster URL already exists for this movie" }, 409);
    }

    // If setting as primary, unset other primary posters
    if (isPrimary) {
      await database
        .update(posterUrls)
        .set({ isPrimary: 0 })
        .where(eq(posterUrls.movieUid, movieId));
    }

    // Add poster URL
    const newPoster = await database
      .insert(posterUrls)
      .values({
        movieUid: movieId,
        url,
        width: width || undefined,
        height: height || undefined,
        languageCode: languageCode || undefined,
        sourceType: "manual",
        isPrimary: isPrimary ? 1 : 0,
      })
      .returning();

    return c.json(newPoster[0]);
  } catch (error) {
    console.error("Error adding poster:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Delete poster URL
adminRoutes.delete(
  "/movies/:movieId/posters/:posterId",
  authMiddleware,
  async c => {
    try {
      const database = getDatabase(c.env as Environment);
      const movieId = c.req.param("movieId");
      const posterId = c.req.param("posterId");

      // Check if poster exists and belongs to the movie
      const posterExists = await database
        .select({ uid: posterUrls.uid, movieUid: posterUrls.movieUid })
        .from(posterUrls)
        .where(eq(posterUrls.uid, posterId))
        .limit(1);

      if (posterExists.length === 0) {
        return c.json({ error: "Poster not found" }, 404);
      }

      if (posterExists[0].movieUid !== movieId) {
        return c.json({ error: "Poster does not belong to this movie" }, 400);
      }

      // Delete poster
      await database.delete(posterUrls).where(eq(posterUrls.uid, posterId));

      return c.json({ success: true });
    } catch (error) {
      console.error("Error deleting poster:", error);
      return c.json({ error: "Internal server error" }, 500);
    }
  },
);

// Update movie IMDB ID
adminRoutes.put("/movies/:id/imdb-id", authMiddleware, async c => {
  try {
    const database = getDatabase(c.env as Environment);
    const movieId = c.req.param("id");
    const { imdbId, refreshData = false } = await c.req.json();

    // Validate IMDB ID format (optional field, can be null/empty)
    if (imdbId && !/^tt\d+$/.test(imdbId)) {
      return c.json({ error: "IMDB ID must be in format 'tt1234567'" }, 400);
    }

    // Check if movie exists
    const movieExists = await database
      .select({ uid: movies.uid })
      .from(movies)
      .where(eq(movies.uid, movieId))
      .limit(1);

    if (movieExists.length === 0) {
      return c.json({ error: "Movie not found" }, 404);
    }

    // Check if IMDB ID is already used by another movie
    if (imdbId) {
      const existingMovie = await database
        .select({ uid: movies.uid })
        .from(movies)
        .where(and(eq(movies.imdbId, imdbId), not(eq(movies.uid, movieId))))
        .limit(1);

      if (existingMovie.length > 0) {
        return c.json(
          { error: "IMDB ID is already used by another movie" },
          409,
        );
      }
    }

    // Update IMDB ID first
    await database
      .update(movies)
      .set({
        imdbId: imdbId || undefined,
        updatedAt: sql`(unixepoch())`,
      })
      .where(eq(movies.uid, movieId));

    // If refreshData is true and imdbId is provided, fetch additional data from TMDb
    const refreshResults = {
      tmdbId: undefined as number | undefined,
      postersAdded: 0,
      translationsAdded: 0,
    };

    if (refreshData && imdbId && c.env.TMDB_API_KEY) {
      try {
        // Import TMDb utilities
        const {
          findTMDBByImdbId,
          fetchTMDBMovieImages,
          fetchTMDBMovieTranslations,
          savePosterUrls,
        } = await import("../../../scrapers/src/common/tmdb-utilities");

        // Find TMDb ID
        const tmdbId = await findTMDBByImdbId(imdbId, c.env.TMDB_API_KEY);

        if (tmdbId) {
          // Update TMDb ID
          await database
            .update(movies)
            .set({ tmdbId })
            .where(eq(movies.uid, movieId));

          refreshResults.tmdbId = tmdbId;

          // Fetch and save posters
          const imagesData = await fetchTMDBMovieImages(
            imdbId,
            c.env.TMDB_API_KEY,
          );
          if (imagesData) {
            const savedPosters = await savePosterUrls(
              movieId,
              imagesData.images.posters,
              c.env as Environment,
            );
            refreshResults.postersAdded = savedPosters;
          }

          // Fetch and save translations using TMDb Translations API
          let translationsAddedForImdb = 0;
          const { translations } = await import(
            "../../../src/schema/translations"
          );

          // Get all translations from TMDb
          const translationsData = await fetchTMDBMovieTranslations(
            tmdbId,
            c.env.TMDB_API_KEY,
          );

          if (translationsData?.translations) {
            // Find English title (original language)
            const englishTranslation = translationsData.translations.find(
              (t: MovieDatabaseTranslation) =>
                t.iso_639_1 === "en" && t.data?.title,
            );

            if (englishTranslation?.data?.title) {
              await database
                .insert(translations)
                .values({
                  resourceType: "movie_title",
                  resourceUid: movieId,
                  languageCode: "en",
                  content: englishTranslation.data.title,
                  isDefault: 1,
                })
                .onConflictDoUpdate({
                  target: [
                    translations.resourceType,
                    translations.resourceUid,
                    translations.languageCode,
                  ],
                  set: {
                    content: englishTranslation.data.title,
                    updatedAt: Math.floor(Date.now() / 1000),
                  },
                });
              translationsAddedForImdb++;
            }

            // Find Japanese title
            const japaneseTranslation = translationsData.translations.find(
              (t: MovieDatabaseTranslation) =>
                t.iso_639_1 === "ja" && t.data?.title,
            );

            if (japaneseTranslation?.data?.title) {
              await database
                .insert(translations)
                .values({
                  resourceType: "movie_title",
                  resourceUid: movieId,
                  languageCode: "ja",
                  content: japaneseTranslation.data.title,
                  isDefault: 0,
                })
                .onConflictDoUpdate({
                  target: [
                    translations.resourceType,
                    translations.resourceUid,
                    translations.languageCode,
                  ],
                  set: {
                    content: japaneseTranslation.data.title,
                    updatedAt: Math.floor(Date.now() / 1000),
                  },
                });
              translationsAddedForImdb++;
            }
          }

          refreshResults.translationsAdded = translationsAddedForImdb;
        }
      } catch (refreshError) {
        console.warn("Error during data refresh:", refreshError);
        // Continue without failing the main operation
      }
    }

    return c.json({
      success: true,
      refreshResults: refreshData ? refreshResults : undefined,
    });
  } catch (error) {
    console.error("Error updating IMDB ID:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Update movie TMDb ID
adminRoutes.put("/movies/:id/tmdb-id", authMiddleware, async c => {
  try {
    const database = getDatabase(c.env as Environment);
    const movieId = c.req.param("id");
    const { tmdbId, refreshData = false } = await c.req.json();

    // Validate TMDb ID (must be a positive integer)
    if (
      tmdbId !== null &&
      tmdbId !== undefined &&
      (!Number.isInteger(tmdbId) || tmdbId <= 0)
    ) {
      return c.json({ error: "TMDb ID must be a positive integer" }, 400);
    }

    // Check if movie exists
    const movieExists = await database
      .select({ uid: movies.uid, imdbId: movies.imdbId })
      .from(movies)
      .where(eq(movies.uid, movieId))
      .limit(1);

    if (movieExists.length === 0) {
      return c.json({ error: "Movie not found" }, 404);
    }

    // Check if TMDb ID is already used by another movie
    if (tmdbId) {
      const existingMovie = await database
        .select({ uid: movies.uid })
        .from(movies)
        .where(and(eq(movies.tmdbId, tmdbId), not(eq(movies.uid, movieId))))
        .limit(1);

      if (existingMovie.length > 0) {
        return c.json(
          { error: "TMDb ID is already used by another movie" },
          409,
        );
      }
    }

    // Update TMDb ID
    await database
      .update(movies)
      .set({
        tmdbId: tmdbId || undefined,
        updatedAt: sql`(unixepoch())`,
      })
      .where(eq(movies.uid, movieId));

    // If refreshData is true and tmdbId is provided, fetch additional data from TMDb
    const refreshResults = {
      postersAdded: 0,
      translationsAdded: 0,
    };

    if (refreshData && tmdbId && c.env.TMDB_API_KEY) {
      try {
        // Import TMDb utilities
        const { fetchTMDBMovieTranslations, savePosterUrls } = await import(
          "../../../scrapers/src/common/tmdb-utilities"
        );

        interface TMDBMovieImages {
          id: number;
          posters: {
            file_path: string;
            width: number;
            height: number;
            iso_639_1: string | null;
          }[];
        }

        // Fetch and save posters using TMDb ID directly
        const imagesUrl = new URL(
          `https://api.themoviedb.org/3/movie/${tmdbId}/images`,
        );
        imagesUrl.searchParams.append("api_key", c.env.TMDB_API_KEY);

        const imagesResponse = await fetch(imagesUrl.toString());
        if (imagesResponse.ok) {
          const images = (await imagesResponse.json()) as TMDBMovieImages;
          if (images.posters && images.posters.length > 0) {
            const savedPosters = await savePosterUrls(
              movieId,
              images.posters,
              c.env as Environment,
            );
            refreshResults.postersAdded = savedPosters;
          }
        }

        // Fetch and save translations using TMDb Translations API
        let translationsAdded = 0;
        const database = getDatabase(c.env as Environment);
        const { translations } = await import(
          "../../../src/schema/translations"
        );

        // Get all translations from TMDb
        const translationsData = await fetchTMDBMovieTranslations(
          tmdbId,
          c.env.TMDB_API_KEY,
        );

        console.log(
          `Translations data for TMDb ID ${tmdbId}:`,
          translationsData?.translations?.length || 0,
          "translations found",
        );

        if (translationsData?.translations) {
          // Find English title (original language)
          const englishTranslation = translationsData.translations.find(
            (t: MovieDatabaseTranslation) =>
              t.iso_639_1 === "en" && t.data?.title,
          );

          if (englishTranslation?.data?.title) {
            await database
              .insert(translations)
              .values({
                resourceType: "movie_title",
                resourceUid: movieId,
                languageCode: "en",
                content: englishTranslation.data.title,
                isDefault: 1,
              })
              .onConflictDoUpdate({
                target: [
                  translations.resourceType,
                  translations.resourceUid,
                  translations.languageCode,
                ],
                set: {
                  content: englishTranslation.data.title,
                  updatedAt: Math.floor(Date.now() / 1000),
                },
              });
            translationsAdded++;
            console.log(
              `Saved English title: ${englishTranslation.data.title}`,
            );
          }

          // Find Japanese title
          const japaneseTranslation = translationsData.translations.find(
            (t: MovieDatabaseTranslation) =>
              t.iso_639_1 === "ja" && t.data?.title,
          );

          if (japaneseTranslation?.data?.title) {
            await database
              .insert(translations)
              .values({
                resourceType: "movie_title",
                resourceUid: movieId,
                languageCode: "ja",
                content: japaneseTranslation.data.title,
                isDefault: 0,
              })
              .onConflictDoUpdate({
                target: [
                  translations.resourceType,
                  translations.resourceUid,
                  translations.languageCode,
                ],
                set: {
                  content: japaneseTranslation.data.title,
                  updatedAt: Math.floor(Date.now() / 1000),
                },
              });
            translationsAdded++;
            console.log(
              `Saved Japanese title: ${japaneseTranslation.data.title}`,
            );
          }
        }

        refreshResults.translationsAdded = translationsAdded;
      } catch (refreshError) {
        console.warn("Error during data refresh:", refreshError);
        // Continue without failing the main operation
      }
    }

    return c.json({
      success: true,
      refreshResults: refreshData ? refreshResults : undefined,
    });
  } catch (error) {
    console.error("Error updating TMDb ID:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Get award organizations, ceremonies, and categories for nomination editing
adminRoutes.get("/awards", authMiddleware, async c => {
  try {
    const database = getDatabase(c.env as Environment);

    // Get award organizations
    const organizations = await database
      .select({
        uid: awardOrganizations.uid,
        name: awardOrganizations.name,
        country: awardOrganizations.country,
      })
      .from(awardOrganizations)
      .orderBy(awardOrganizations.name);

    // Get award ceremonies
    const ceremonies = await database
      .select({
        uid: awardCeremonies.uid,
        organizationUid: awardCeremonies.organizationUid,
        year: awardCeremonies.year,
        ceremonyNumber: awardCeremonies.ceremonyNumber,
        organizationName: awardOrganizations.name,
      })
      .from(awardCeremonies)
      .innerJoin(
        awardOrganizations,
        eq(awardCeremonies.organizationUid, awardOrganizations.uid),
      )
      .orderBy(awardOrganizations.name, awardCeremonies.year);

    // Get award categories
    const categories = await database
      .select({
        uid: awardCategories.uid,
        organizationUid: awardCategories.organizationUid,
        name: awardCategories.name,
        organizationName: awardOrganizations.name,
      })
      .from(awardCategories)
      .innerJoin(
        awardOrganizations,
        eq(awardCategories.organizationUid, awardOrganizations.uid),
      )
      .orderBy(awardOrganizations.name, awardCategories.name);

    return c.json({
      organizations,
      ceremonies,
      categories,
    });
  } catch (error) {
    console.error("Error fetching awards data:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Add nomination
adminRoutes.post("/movies/:movieId/nominations", authMiddleware, async c => {
  try {
    const database = getDatabase(c.env as Environment);
    const movieId = c.req.param("movieId");
    const {
      ceremonyUid,
      categoryUid,
      isWinner = false,
      specialMention,
    } = await c.req.json();

    // Validate required fields
    if (!ceremonyUid || !categoryUid) {
      return c.json({ error: "Ceremony and category are required" }, 400);
    }

    // Check if movie exists
    const movieExists = await database
      .select({ uid: movies.uid })
      .from(movies)
      .where(eq(movies.uid, movieId))
      .limit(1);

    if (movieExists.length === 0) {
      return c.json({ error: "Movie not found" }, 404);
    }

    // Check if ceremony exists
    const ceremonyExists = await database
      .select({ uid: awardCeremonies.uid })
      .from(awardCeremonies)
      .where(eq(awardCeremonies.uid, ceremonyUid))
      .limit(1);

    if (ceremonyExists.length === 0) {
      return c.json({ error: "Ceremony not found" }, 404);
    }

    // Check if category exists
    const categoryExists = await database
      .select({ uid: awardCategories.uid })
      .from(awardCategories)
      .where(eq(awardCategories.uid, categoryUid))
      .limit(1);

    if (categoryExists.length === 0) {
      return c.json({ error: "Category not found" }, 404);
    }

    // Check if nomination already exists
    const existingNomination = await database
      .select({ uid: nominations.uid })
      .from(nominations)
      .where(
        and(
          eq(nominations.movieUid, movieId),
          eq(nominations.ceremonyUid, ceremonyUid),
          eq(nominations.categoryUid, categoryUid),
        ),
      )
      .limit(1);

    if (existingNomination.length > 0) {
      return c.json(
        {
          error:
            "Nomination already exists for this movie, ceremony, and category",
        },
        409,
      );
    }

    // Add nomination
    const newNomination = await database
      .insert(nominations)
      .values({
        movieUid: movieId,
        ceremonyUid,
        categoryUid,
        isWinner: isWinner ? 1 : 0,
        specialMention: specialMention || undefined,
      })
      .returning();

    return c.json(newNomination[0]);
  } catch (error) {
    console.error("Error adding nomination:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Update nomination
adminRoutes.put("/nominations/:nominationId", authMiddleware, async c => {
  try {
    const database = getDatabase(c.env as Environment);
    const nominationId = c.req.param("nominationId");
    const { isWinner, specialMention } = await c.req.json();

    // Check if nomination exists
    const nomination = await database
      .select({ uid: nominations.uid })
      .from(nominations)
      .where(eq(nominations.uid, nominationId))
      .limit(1);

    if (nomination.length === 0) {
      return c.json({ error: "Nomination not found" }, 404);
    }

    // Update nomination
    await database
      .update(nominations)
      .set({
        isWinner: isWinner ? 1 : 0,
        specialMention: specialMention || undefined,
        updatedAt: sql`(unixepoch())`,
      })
      .where(eq(nominations.uid, nominationId));

    return c.json({ success: true });
  } catch (error) {
    console.error("Error updating nomination:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Delete nomination
adminRoutes.delete("/nominations/:nominationId", authMiddleware, async c => {
  try {
    const database = getDatabase(c.env as Environment);
    const nominationId = c.req.param("nominationId");

    // Check if nomination exists
    const nomination = await database
      .select({ uid: nominations.uid })
      .from(nominations)
      .where(eq(nominations.uid, nominationId))
      .limit(1);

    if (nomination.length === 0) {
      return c.json({ error: "Nomination not found" }, 404);
    }

    // Delete nomination
    await database.delete(nominations).where(eq(nominations.uid, nominationId));

    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting nomination:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Merge movies - combines source movie data into target movie and deletes source
adminRoutes.post(
  "/movies/:sourceId/merge/:targetId",
  authMiddleware,
  async c => {
    try {
      const database = getDatabase(c.env as Environment);
      const sourceId = c.req.param("sourceId");
      const targetId = c.req.param("targetId");

      if (sourceId === targetId) {
        return c.json(
          { error: "Source and target cannot be the same movie" },
          400,
        );
      }

      // Verify both movies exist
      const [sourceMovie] = await database
        .select()
        .from(movies)
        .where(eq(movies.uid, sourceId))
        .limit(1);

      const [targetMovie] = await database
        .select()
        .from(movies)
        .where(eq(movies.uid, targetId))
        .limit(1);

      if (!sourceMovie) {
        return c.json({ error: "Source movie not found" }, 404);
      }

      if (!targetMovie) {
        return c.json({ error: "Target movie not found" }, 404);
      }

      // Merge operations in transaction
      await database.transaction(async tx => {
        // Update article_links
        await tx
          .update(articleLinks)
          .set({ movieUid: targetId })
          .where(eq(articleLinks.movieUid, sourceId));

        // Update movie_selections
        await tx
          .update(movieSelections)
          .set({ movieId: targetId })
          .where(eq(movieSelections.movieId, sourceId));

        // Update nominations
        await tx
          .update(nominations)
          .set({ movieUid: targetId })
          .where(eq(nominations.movieUid, sourceId));

        // Update reference_urls
        await tx
          .update(referenceUrls)
          .set({ movieUid: targetId })
          .where(eq(referenceUrls.movieUid, sourceId));

        // Merge translations (avoid duplicates)
        const sourceTranslations = await tx
          .select()
          .from(translations)
          .where(
            and(
              eq(translations.resourceType, "movie_title"),
              eq(translations.resourceUid, sourceId),
            ),
          );

        for (const translation of sourceTranslations) {
          await tx
            .insert(translations)
            .values({
              resourceType: "movie_title",
              resourceUid: targetId,
              languageCode: translation.languageCode,
              content: translation.content,
              isDefault: translation.isDefault,
            })
            .onConflictDoNothing({
              target: [
                translations.resourceType,
                translations.resourceUid,
                translations.languageCode,
              ],
            });
        }

        // Delete source translations
        await tx
          .delete(translations)
          .where(
            and(
              eq(translations.resourceType, "movie_title"),
              eq(translations.resourceUid, sourceId),
            ),
          );

        // Merge poster URLs (avoid duplicates by URL)
        const sourcePosters = await tx
          .select()
          .from(posterUrls)
          .where(eq(posterUrls.movieUid, sourceId));

        // Get existing target posters to check for URL duplicates
        const existingTargetPosters = await tx
          .select({ url: posterUrls.url })
          .from(posterUrls)
          .where(eq(posterUrls.movieUid, targetId));

        const existingUrls = new Set(existingTargetPosters.map(p => p.url));

        for (const poster of sourcePosters) {
          // Only insert if URL doesn't already exist for target movie
          if (!existingUrls.has(poster.url)) {
            await tx.insert(posterUrls).values({
              movieUid: targetId,
              url: poster.url,
              width: poster.width,
              height: poster.height,
              languageCode: poster.languageCode,
              countryCode: poster.countryCode,
              sourceType: poster.sourceType,
              isPrimary: poster.isPrimary,
            });
          }
        }

        // Delete source posters
        await tx.delete(posterUrls).where(eq(posterUrls.movieUid, sourceId));

        // Update target movie with merged metadata (preserve existing if target has data)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updateData: any = {
          updatedAt: sql`(unixepoch())`,
        };

        if (!targetMovie.imdbId && sourceMovie.imdbId) {
          // Check if IMDb ID is already used by another movie
          const existingImdbMovie = await tx
            .select({ uid: movies.uid })
            .from(movies)
            .where(
              and(
                eq(movies.imdbId, sourceMovie.imdbId),
                not(eq(movies.uid, targetId)),
              ),
            )
            .limit(1);

          if (existingImdbMovie.length === 0) {
            updateData.imdbId = sourceMovie.imdbId;
          }
        }

        if (!targetMovie.tmdbId && sourceMovie.tmdbId) {
          // Check if TMDb ID is already used by another movie
          const existingTmdbMovie = await tx
            .select({ uid: movies.uid })
            .from(movies)
            .where(
              and(
                eq(movies.tmdbId, sourceMovie.tmdbId),
                not(eq(movies.uid, targetId)),
              ),
            )
            .limit(1);

          if (existingTmdbMovie.length === 0) {
            updateData.tmdbId = sourceMovie.tmdbId;
          }
        }

        if (Object.keys(updateData).length > 1) {
          await tx
            .update(movies)
            .set(updateData)
            .where(eq(movies.uid, targetId));
        }

        // Finally, delete the source movie
        await tx.delete(movies).where(eq(movies.uid, sourceId));
      });

      return c.json({
        success: true,
        message: `Movie ${sourceId} successfully merged into ${targetId}`,
      });
    } catch (error) {
      console.error("Error merging movies:", error);
      return c.json(
        {
          error: "Internal server error",
          details: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  },
);
