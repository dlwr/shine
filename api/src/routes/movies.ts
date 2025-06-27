import { and, eq, getDatabase, sql, type Environment } from "db";
import { articleLinks } from "db/schema/article-links";
import { movies } from "db/schema/movies";
import { Hono } from "hono";
import { authMiddleware } from "../auth";
import { sanitizeText, sanitizeUrl } from "../middleware/sanitizer";
import { MoviesService } from "../services";
import {
  checkETag,
  createCachedResponse,
  createETag,
  EdgeCache,
  getCacheKeyForMovie,
  getCacheTTL,
} from "../utils/cache";

export const moviesRoutes = new Hono<{ Bindings: Environment }>();

const cache = new EdgeCache();

// Search movies endpoint
moviesRoutes.get("/search", async c => {
  try {
    const moviesService = new MoviesService(c.env as Environment);
    const page = Number(c.req.query("page") || 1);
    const limit = Math.min(Number(c.req.query("limit") || 20), 100);
    const rawQuery = c.req.query("q");
    const yearFilter = c.req.query("year");
    const languageFilter = c.req.query("language");
    const hasAwardsFilter = c.req.query("hasAwards");

    const query = rawQuery ? sanitizeText(rawQuery) : undefined;

    let hasAwards: boolean | undefined;
    if (hasAwardsFilter === "true") {
      hasAwards = true;
    } else if (hasAwardsFilter === "false") {
      hasAwards = false;
    } else {
      hasAwards = undefined;
    }

    const result = await moviesService.searchMovies({
      page,
      limit,
      query,
      year: yearFilter ? Number(yearFilter) : undefined,
      language: languageFilter,
      hasAwards,
    });

    return c.json({
      movies: result.movies,
      pagination: {
        currentPage: result.pagination.currentPage,
        totalPages: result.pagination.totalPages,
        totalCount: result.pagination.totalCount,
        hasNextPage: result.pagination.hasNext,
        hasPrevPage: result.pagination.hasPrev,
      },
      filters: {
        query,
        year: yearFilter ? Number(yearFilter) : undefined,
        language: languageFilter,
        hasAwards,
      },
    });
  } catch (error) {
    console.error("Error searching movies:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Get movie details with all translations
moviesRoutes.get("/:id", async c => {
  try {
    const moviesService = new MoviesService(c.env as Environment);
    const movieId = c.req.param("id");
    const locale = c.req.query("locale") || "ja";

    // Check cache first
    const cacheKey = getCacheKeyForMovie(movieId, true);
    const cachedResponse = await cache.get(cacheKey);

    if (cachedResponse) {
      console.log("Cache hit for movie details:", movieId);
      return cachedResponse;
    }

    console.log("Cache miss for movie details:", movieId);

    const movieDetails = await moviesService.getMovieDetails(movieId, locale);

    const imdbUrl = movieDetails.imdbId
      ? `https://www.imdb.com/title/${movieDetails.imdbId}/`
      : undefined;

    const result = {
      uid: movieDetails.uid,
      year: movieDetails.year,
      originalLanguage: movieDetails.originalLanguage,
      imdbId: movieDetails.imdbId,
      tmdbId: movieDetails.tmdbId,
      imdbUrl,
      posterUrl: movieDetails.posterUrl,
      title: movieDetails.title,
      description: movieDetails.description,
      nominations: movieDetails.nominations,
    };

    // Create ETag for the response
    const etag = createETag(result);

    // Check if client has the same version
    if (checkETag(c.req, etag)) {
      return c.newResponse("", 304, {
        ETag: etag,
        "Cache-Control": "public, max-age=86400",
      });
    }

    // Create cached response with 24 hour TTL
    const ttl = getCacheTTL.movie.full;
    const response = createCachedResponse(result, ttl, {
      ETag: etag,
      "X-Cache-Status": "MISS",
    });

    // Store in cache
    await cache.put(cacheKey, response, ttl);

    return response;
  } catch (error) {
    console.error("Error fetching movie details:", error);

    if (error instanceof Error && error.message === "Movie not found") {
      return c.json({ error: "Movie not found" }, 404);
    }

    return c.json({ error: "Internal server error" }, 500);
  }
});

// Add or update movie translation
moviesRoutes.post("/:id/translations", authMiddleware, async c => {
  try {
    const moviesService = new MoviesService(c.env as Environment);
    const movieId = c.req.param("id");
    const { languageCode, content: rawContent } = await c.req.json();

    if (!languageCode || !rawContent) {
      return c.json({ error: "languageCode and content are required" }, 400);
    }

    if (languageCode.length !== 2) {
      return c.json({ error: "Language code must be 2 characters" }, 400);
    }

    const content = sanitizeText(rawContent);

    await moviesService.addMovieTranslation(movieId, languageCode, content);

    // Invalidate movie details cache
    await Promise.all([
      cache.delete(getCacheKeyForMovie(movieId, true)),
      cache.delete(getCacheKeyForMovie(movieId, false)),
      cache.deleteByPattern(`selections:all:`), // Invalidate main selections that might include this movie
    ]);

    console.log(
      `Cache invalidated for movie ${movieId} after translation update`,
    );

    return c.json({ success: true });
  } catch (error) {
    console.error("Error adding/updating translation:", error);

    if (error instanceof Error && error.message === "Movie not found") {
      return c.json({ error: "Movie not found" }, 404);
    }

    return c.json({ error: "Internal server error" }, 500);
  }
});

// Delete movie translation
moviesRoutes.delete("/:id/translations/:lang", authMiddleware, async c => {
  try {
    const moviesService = new MoviesService(c.env as Environment);
    const movieId = c.req.param("id");
    const languageCode = c.req.param("lang");

    await moviesService.deleteMovieTranslation(movieId, languageCode);

    // Invalidate movie details cache
    await Promise.all([
      cache.delete(getCacheKeyForMovie(movieId, true)),
      cache.delete(getCacheKeyForMovie(movieId, false)),
      cache.deleteByPattern(`selections:all:`),
    ]);

    console.log(
      `Cache invalidated for movie ${movieId} after translation deletion`,
    );

    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting translation:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Submit article link
moviesRoutes.post("/:id/article-links", async c => {
  try {
    const database = getDatabase(c.env as Environment);
    const movieId = c.req.param("id");
    const {
      url: rawUrl,
      title: rawTitle,
      description: rawDescription,
    } = await c.req.json();

    if (!rawUrl || !rawTitle) {
      return c.json({ error: "URL and title are required" }, 400);
    }

    if (rawTitle.length > 200) {
      return c.json({ error: "Title too long" }, 400);
    }

    if (rawDescription && rawDescription.length > 500) {
      return c.json({ error: "Description too long" }, 400);
    }

    const url = sanitizeUrl(rawUrl);
    const title = sanitizeText(rawTitle);
    const description = rawDescription
      ? sanitizeText(rawDescription)
      : undefined;

    // Check if movie exists
    const movieExists = await database
      .select({ uid: movies.uid })
      .from(movies)
      .where(eq(movies.uid, movieId))
      .limit(1);

    if (movieExists.length === 0) {
      return c.json({ error: "Movie not found" }, 404);
    }

    // Get IP address for rate limiting
    const ip =
      c.req.header("cf-connecting-ip") ||
      c.req.header("x-forwarded-for") ||
      c.req.header("x-real-ip") ||
      "unknown";

    // Check rate limit (max 10 submissions per IP per hour)
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);

    const recentSubmissions = await database
      .select({ count: sql<number>`count(*)` })
      .from(articleLinks)
      .where(
        and(
          eq(articleLinks.submitterIp, ip),
          sql`${articleLinks.submittedAt} > ${oneHourAgo}`,
        ),
      );

    if (recentSubmissions[0].count >= 10) {
      return c.json(
        { error: "Rate limit exceeded. Please try again later." },
        429,
      );
    }

    // Insert article link
    const newArticle = await database
      .insert(articleLinks)
      .values({
        movieUid: movieId,
        url,
        title: title.slice(0, 200), // Limit title length
        description: description ? description.slice(0, 500) : undefined,
        submitterIp: ip,
      })
      .returning();

    return c.json(newArticle[0]);
  } catch (error) {
    console.error("Error submitting article link:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Get article links for a movie
moviesRoutes.get("/:id/article-links", async c => {
  try {
    const database = getDatabase(c.env as Environment);
    const movieId = c.req.param("id");

    const articles = await database
      .select({
        uid: articleLinks.uid,
        url: articleLinks.url,
        title: articleLinks.title,
        description: articleLinks.description,
        submittedAt: articleLinks.submittedAt,
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
      .limit(20);

    return c.json(articles);
  } catch (error) {
    console.error("Error fetching article links:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});
