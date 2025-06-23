import { and, eq, getDatabase, like, sql, type Environment } from "db";
import { articleLinks } from "db/schema/article-links";
import { awardCategories } from "db/schema/award-categories";
import { awardCeremonies } from "db/schema/award-ceremonies";
import { awardOrganizations } from "db/schema/award-organizations";
import { movies } from "db/schema/movies";
import { nominations } from "db/schema/nominations";
import { posterUrls } from "db/schema/poster-urls";
import { translations } from "db/schema/translations";
import { Hono } from "hono";
import { authMiddleware } from "../auth";
import { sanitizeText, sanitizeUrl } from "../middleware/sanitizer";

export const moviesRoutes = new Hono<{ Bindings: Environment }>();

// Search movies endpoint
moviesRoutes.get("/search", async (c) => {
  try {
    const database = getDatabase(c.env as Environment);
    const page = Number(c.req.query("page") || 1);
    const limit = Math.min(Number(c.req.query("limit") || 20), 100);
    const rawQuery = c.req.query("q");
    const yearFilter = c.req.query("year");
    const languageFilter = c.req.query("language");
    const hasAwardsFilter = c.req.query("hasAwards");
    
    const query = rawQuery ? sanitizeText(rawQuery) : undefined;
    const offset = (page - 1) * limit;

    // Build search conditions
    const conditions = [];
    
    if (query) {
      conditions.push(like(translations.content, `%${query}%`));
    }
    
    if (yearFilter && !Number.isNaN(Number(yearFilter))) {
      conditions.push(eq(movies.year, Number(yearFilter)));
    }
    
    if (languageFilter) {
      conditions.push(eq(movies.originalLanguage, languageFilter));
    }

    // Base query for movies with translations
    const baseQuery = database
      .select({
        uid: movies.uid,
        year: movies.year,
        originalLanguage: movies.originalLanguage,
        imdbId: movies.imdbId,
        tmdbId: movies.tmdbId,
        title: translations.content,
        posterUrl: sql`
          (
            SELECT url
            FROM poster_urls
            WHERE poster_urls.movie_uid = movies.uid
            ORDER BY is_primary DESC, created_at ASC
            LIMIT 1
          )
        `.as("posterUrl"),
        hasAwards: sql`
          CASE WHEN EXISTS (
            SELECT 1 FROM nominations 
            WHERE nominations.movie_uid = movies.uid
          ) THEN 1 ELSE 0 END
        `.as("hasAwards"),
      })
      .from(movies)
      .leftJoin(
        translations,
        and(
          eq(movies.uid, translations.resourceUid),
          eq(translations.resourceType, "movie_title"),
          eq(translations.isDefault, 1)
        )
      );

    // Apply conditions
    const searchQuery = conditions.length > 0 
      ? baseQuery.where(and(...conditions))
      : baseQuery;

    // Handle awards filter
    const finalQuery = hasAwardsFilter === "true"
      ? searchQuery.having(sql`hasAwards = 1`)
      : (hasAwardsFilter === "false"
        ? searchQuery.having(sql`hasAwards = 0`)
        : searchQuery);

    // Count query
    const baseCountQuery = database
      .select({ count: sql`COUNT(DISTINCT movies.uid)`.as("count") })
      .from(movies)
      .leftJoin(
        translations,
        and(
          eq(movies.uid, translations.resourceUid),
          eq(translations.resourceType, "movie_title"),
          eq(translations.isDefault, 1)
        )
      );

    const countQuery = conditions.length > 0 
      ? baseCountQuery.where(and(...conditions))
      : baseCountQuery;

    // Execute queries
    const [countResult, moviesResult] = await Promise.all([
      countQuery,
      finalQuery
        .orderBy(sql`${movies.year} DESC`, sql`${translations.content} ASC`)
        .limit(limit)
        .offset(offset),
    ]);

    const totalCount = Number(countResult[0].count);
    const totalPages = Math.ceil(totalCount / limit);

    return c.json({
      movies: moviesResult.map((movie) => ({
        uid: movie.uid,
        year: movie.year,
        originalLanguage: movie.originalLanguage,
        imdbId: movie.imdbId,
        tmdbId: movie.tmdbId,
        title: movie.title || "Untitled",
        posterUrl: movie.posterUrl,
        hasAwards: movie.hasAwards === 1,
      })),
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
      filters: {
        query,
        year: yearFilter ? Number(yearFilter) : undefined,
        language: languageFilter,
        hasAwards: hasAwardsFilter === "true" ? true : (hasAwardsFilter === "false" ? false : undefined),
      },
    });
  } catch (error) {
    console.error("Error searching movies:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

async function getMovieNominations(
  database: ReturnType<typeof getDatabase>,
  movieId: string
) {
  const nominationsData = await database
    .select({
      nominationUid: nominations.uid,
      isWinner: nominations.isWinner,
      specialMention: nominations.specialMention,
      categoryUid: awardCategories.uid,
      categoryName: awardCategories.name,
      categoryNameEn: awardCategories.nameEn,
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
      eq(nominations.categoryUid, awardCategories.uid)
    )
    .innerJoin(
      awardCeremonies,
      eq(nominations.ceremonyUid, awardCeremonies.uid)
    )
    .innerJoin(
      awardOrganizations,
      eq(awardCeremonies.organizationUid, awardOrganizations.uid)
    )
    .where(eq(nominations.movieUid, movieId))
    .orderBy(
      awardCeremonies.year,
      awardOrganizations.name,
      awardCategories.name
    );

  return nominationsData.map((nom: (typeof nominationsData)[0]) => ({
    uid: nom.nominationUid,
    isWinner: nom.isWinner === 1,
    specialMention: nom.specialMention,
    category: {
      uid: nom.categoryUid,
      name: nom.categoryNameEn || nom.categoryName,
    },
    ceremony: {
      uid: nom.ceremonyUid,
      number: nom.ceremonyNumber,
      year: nom.ceremonyYear,
    },
    organization: {
      uid: nom.organizationUid,
      name: nom.organizationName,
      shortName: nom.organizationShortName,
    },
  }));
}

// Get movie details with all translations
moviesRoutes.get("/:id", async (c) => {
  try {
    const database = getDatabase(c.env as Environment);
    const movieId = c.req.param("id");

    // Get movie basic info
    const movieResult = await database
      .select()
      .from(movies)
      .where(eq(movies.uid, movieId))
      .limit(1);

    if (movieResult.length === 0) {
      return c.json({ error: "Movie not found" }, 404);
    }

    const movie = movieResult[0];

    // Get all translations for this movie
    const movieTranslations = await database
      .select({
        languageCode: translations.languageCode,
        content: translations.content,
        isDefault: translations.isDefault,
      })
      .from(translations)
      .where(
        and(
          eq(translations.resourceUid, movieId),
          eq(translations.resourceType, "movie_title")
        )
      );

    // Get poster URLs
    const posterResult = await database
      .select({
        uid: posterUrls.uid,
        url: posterUrls.url,
        width: posterUrls.width,
        height: posterUrls.height,
        languageCode: posterUrls.languageCode,
        sourceType: posterUrls.sourceType,
        isPrimary: posterUrls.isPrimary,
      })
      .from(posterUrls)
      .where(eq(posterUrls.movieUid, movieId))
      .orderBy(posterUrls.isPrimary, posterUrls.createdAt);

    // Get nominations
    const movieNominations = await getMovieNominations(database, movieId);

    const imdbUrl = movie.imdbId
      ? `https://www.imdb.com/title/${movie.imdbId}/`
      : undefined;

    return c.json({
      uid: movie.uid,
      year: movie.year,
      originalLanguage: movie.originalLanguage,
      imdbId: movie.imdbId,
      tmdbId: movie.tmdbId,
      imdbUrl: imdbUrl,
      posterUrl: posterResult[0]?.url,
      posters: posterResult.map((p) => ({
        uid: p.uid,
        url: p.url,
        width: p.width,
        height: p.height,
        languageCode: p.languageCode,
        sourceType: p.sourceType,
        isPrimary: p.isPrimary === 1,
      })),
      translations: movieTranslations.map(
        (t: {
          languageCode: string;
          content: string;
          isDefault: number | null;
        }) => ({
          languageCode: t.languageCode,
          content: t.content,
          isDefault: t.isDefault === 1,
        })
      ),
      nominations: movieNominations,
    });
  } catch (error) {
    console.error("Error fetching movie details:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Add or update movie translation
moviesRoutes.post("/:id/translations", authMiddleware, async (c) => {
  try {
    const database = getDatabase(c.env as Environment);
    const movieId = c.req.param("id");
    const { languageCode, content: rawContent } = await c.req.json();
    
    if (!languageCode || !rawContent) {
      return c.json({ error: "languageCode and content are required" }, 400);
    }
    
    if (languageCode.length !== 2) {
      return c.json({ error: "Language code must be 2 characters" }, 400);
    }
    
    const content = sanitizeText(rawContent);
    const isDefault = false;


    // Check if movie exists
    const movieExists = await database
      .select({ uid: movies.uid })
      .from(movies)
      .where(eq(movies.uid, movieId))
      .limit(1);

    if (movieExists.length === 0) {
      return c.json({ error: "Movie not found" }, 404);
    }

    // Check if translation already exists
    const existingTranslation = await database
      .select()
      .from(translations)
      .where(
        and(
          eq(translations.resourceUid, movieId),
          eq(translations.resourceType, "movie_title"),
          eq(translations.languageCode, languageCode)
        )
      )
      .limit(1);

    await (existingTranslation.length > 0
      ? database
          .update(translations)
          .set({
            content,
            isDefault: isDefault ? 1 : 0,
            updatedAt: Math.floor(Date.now() / 1000),
          })
          .where(eq(translations.uid, existingTranslation[0].uid))
      : database.insert(translations).values({
          resourceType: "movie_title",
          resourceUid: movieId,
          languageCode,
          content,
          isDefault: isDefault ? 1 : 0,
        }));

    return c.json({ success: true });
  } catch (error) {
    console.error("Error adding/updating translation:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Delete movie translation
moviesRoutes.delete("/:id/translations/:lang", authMiddleware, async (c) => {
  try {
    const database = getDatabase(c.env as Environment);
    const movieId = c.req.param("id");
    const languageCode = c.req.param("lang");

    await database
      .delete(translations)
      .where(
        and(
          eq(translations.resourceUid, movieId),
          eq(translations.resourceType, "movie_title"),
          eq(translations.languageCode, languageCode)
        )
      );

    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting translation:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Submit article link
moviesRoutes.post("/:id/article-links", async (c) => {
  try {
    const database = getDatabase(c.env as Environment);
    const movieId = c.req.param("id");
    const { url: rawUrl, title: rawTitle, description: rawDescription } = await c.req.json();
    
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
    const description = rawDescription ? sanitizeText(rawDescription) : undefined;

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
          sql`${articleLinks.submittedAt} > ${oneHourAgo}`
        )
      );

    if (recentSubmissions[0].count >= 10) {
      return c.json(
        { error: "Rate limit exceeded. Please try again later." },
        429
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
moviesRoutes.get("/:id/article-links", async (c) => {
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
          eq(articleLinks.isFlagged, false)
        )
      )
      .orderBy(sql`${articleLinks.submittedAt} DESC`)
      .limit(20);

    return c.json(articles);
  } catch (error) {
    console.error("Error fetching article links:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});