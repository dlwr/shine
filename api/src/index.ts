import { and, eq, getDatabase, not, sql, type Environment } from "db";
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
import { cors } from "hono/cors";
import { authMiddleware, createJWT } from "./auth";

const app = new Hono<{ Bindings: Environment }>();

app.use("*", cors());

function simpleHash(input: string): number {
  let hash = 0;
  for (let index = 0; index < input.length; index++) {
    const char = input.codePointAt(index) || 0;
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

function getSelectionDate(
  date: Date,
  type: "daily" | "weekly" | "monthly"
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

function getDateSeed(date: Date, type: "daily" | "weekly" | "monthly"): number {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  switch (type) {
    case "daily": {
      const dateString = `${year}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
      return simpleHash(`daily-${dateString}`);
    }
    case "weekly": {
      const daysSinceFriday = (date.getDay() - 5 + 7) % 7;
      const fridayDate = new Date(date);
      fridayDate.setDate(day - daysSinceFriday);
      const weekString = `${fridayDate.getFullYear()}-${(fridayDate.getMonth() + 1).toString().padStart(2, "0")}-${fridayDate.getDate().toString().padStart(2, "0")}`;
      return simpleHash(`weekly-${weekString}`);
    }
    case "monthly": {
      const monthString = `${year}-${month.toString().padStart(2, "0")}`;
      return simpleHash(`monthly-${monthString}`);
    }
  }
}

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

async function getMovieByDateSeed(
  database: ReturnType<typeof getDatabase>,
  date: Date,
  type: "daily" | "weekly" | "monthly",
  preferredLanguage = "en",
  forceNew = false
) {
  const selectionDate = getSelectionDate(date, type);

  // First, check if we already have a selection for this date and type
  const existingSelection = await database
    .select()
    .from(movieSelections)
    .where(
      and(
        eq(movieSelections.selectionType, type),
        eq(movieSelections.selectionDate, selectionDate)
      )
    )
    .limit(1);

  let movieId: string;

  if (existingSelection.length > 0 && !forceNew) {
    // Use the existing selection
    movieId = existingSelection[0].movieId;
  } else {
    // Generate a new selection
    let seed = getDateSeed(date, type);

    // If forcing new selection, add extra randomness
    if (forceNew) {
      seed = seed + Date.now();
    }

    // Get a random movie using the seed
    const randomMovieResult = await database
      .select({ uid: movies.uid })
      .from(movies)
      .orderBy(
        sql`(ABS(${seed} % (SELECT COUNT(*) FROM movies)) + movies.rowid) % (SELECT COUNT(*) FROM movies)`
      )
      .limit(1);

    if (randomMovieResult.length === 0) {
      return;
    }

    movieId = randomMovieResult[0].uid;

    // Save the new selection to the database (replace existing if needed)
    try {
      if (existingSelection.length > 0) {
        // Delete existing selection first
        await database
          .delete(movieSelections)
          .where(
            and(
              eq(movieSelections.selectionType, type),
              eq(movieSelections.selectionDate, selectionDate)
            )
          );
      }

      await database.insert(movieSelections).values({
        selectionType: type,
        selectionDate: selectionDate,
        movieId: movieId,
      });
    } catch (error) {
      // If there's a race condition and another instance already inserted this selection,
      // just continue with the movieId we selected
      console.error("Error saving movie selection:", error);
    }
  }

  // Now fetch the full movie details with translations and poster
  const results = await database
    .select()
    .from(movies)
    .leftJoin(
      translations,
      and(
        eq(movies.uid, translations.resourceUid),
        eq(translations.resourceType, "movie_title"),
        eq(translations.languageCode, preferredLanguage)
      )
    )
    .leftJoin(posterUrls, eq(movies.uid, posterUrls.movieUid))
    .where(eq(movies.uid, movieId))
    .limit(1);

  if (results.length === 0 || !results[0].translations?.content) {
    // Try with default language
    const fallbackResults = await database
      .select()
      .from(movies)
      .leftJoin(
        translations,
        and(
          eq(movies.uid, translations.resourceUid),
          eq(translations.resourceType, "movie_title"),
          eq(translations.isDefault, 1)
        )
      )
      .leftJoin(posterUrls, eq(movies.uid, posterUrls.movieUid))
      .where(eq(movies.uid, movieId))
      .limit(1);

    if (fallbackResults.length > 0) {
      const {
        movies: movie,
        translations: translation,
        poster_urls: poster,
      } = fallbackResults[0];

      const imdbUrl = movie.imdbId
        ? `https://www.imdb.com/title/${movie.imdbId}/`
        : undefined;

      // Get nominations for this movie
      const movieNominations = await getMovieNominations(database, movie.uid);

      return {
        uid: movie.uid,
        year: movie.year,
        originalLanguage: movie.originalLanguage,
        title: translation?.content,
        posterUrl: poster?.url,
        imdbUrl: imdbUrl,
        nominations: movieNominations,
      };
    }
  }

  if (results.length === 0) {
    return;
  }

  const {
    movies: movie,
    translations: translation,
    poster_urls: poster,
  } = results[0];

  const imdbUrl = movie.imdbId
    ? `https://www.imdb.com/title/${movie.imdbId}/`
    : undefined;

  // Get nominations for this movie
  const movieNominations = await getMovieNominations(database, movie.uid);

  // Get article links for this movie
  const topArticles = await database
    .select({
      uid: articleLinks.uid,
      url: articleLinks.url,
      title: articleLinks.title,
      description: articleLinks.description,
    })
    .from(articleLinks)
    .where(
      and(
        eq(articleLinks.movieUid, movie.uid),
        eq(articleLinks.isSpam, false),
        eq(articleLinks.isFlagged, false)
      )
    )
    .orderBy(sql`${articleLinks.submittedAt} DESC`)
    .limit(3);

  return {
    uid: movie.uid,
    year: movie.year,
    originalLanguage: movie.originalLanguage,
    title: translation?.content,
    posterUrl: poster?.url,
    imdbUrl: imdbUrl,
    nominations: movieNominations,
    articleLinks: topArticles,
  };
}

function parseAcceptLanguage(acceptLanguage?: string): string[] {
  if (!acceptLanguage) return [];

  return acceptLanguage
    .split(",")
    .map((lang) => {
      const [code, q] = lang.trim().split(";q=");
      return {
        code: code.split("-")[0],
        quality: q ? Number.parseFloat(q) : 1,
      };
    })
    .sort((a, b) => b.quality - a.quality)
    .map((lang) => lang.code);
}

app.post("/auth/login", async (c) => {
  const { password } = await c.req.json();

  if (!password || !c.env.ADMIN_PASSWORD || password !== c.env.ADMIN_PASSWORD) {
    return c.json({ error: "Invalid password" }, 401);
  }

  if (!c.env.JWT_SECRET) {
    return c.json({ error: "JWT_SECRET not configured" }, 500);
  }

  const token = await createJWT(c.env.JWT_SECRET);
  return c.json({ token });
});

app.get("/", async (c) => {
  try {
    const database = getDatabase(c.env as Environment);
    const now = new Date();

    const localeParameter = c.req.query("locale");
    const acceptLanguage = c.req.header("accept-language");
    const preferredLanguages = localeParameter
      ? [localeParameter]
      : parseAcceptLanguage(acceptLanguage);
    const locale =
      preferredLanguages.find((lang) => ["en", "ja"].includes(lang)) || "en";

    const [dailyMovie, weeklyMovie, monthlyMovie] = await Promise.all([
      getMovieByDateSeed(database, now, "daily", locale),
      getMovieByDateSeed(database, now, "weekly", locale),
      getMovieByDateSeed(database, now, "monthly", locale),
    ]);

    return c.json({
      daily: dailyMovie,
      weekly: weeklyMovie,
      monthly: monthlyMovie,
    });
  } catch (error) {
    console.error("Error fetching feature movies:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

app.post("/reselect", authMiddleware, async (c) => {
  try {
    const database = getDatabase(c.env as Environment);
    const now = new Date();

    const body = await c.req.json();
    const { type, locale = "en" } = body;

    if (!type || !["daily", "weekly", "monthly"].includes(type)) {
      return c.json({ error: "Invalid selection type" }, 400);
    }

    const movie = await getMovieByDateSeed(database, now, type, locale, true);

    return c.json({
      type,
      movie,
    });
  } catch (error) {
    console.error("Error reselecting movie:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Admin: Preview next period movie selections
app.get("/admin/preview-selections", authMiddleware, async (c) => {
  try {
    const database = getDatabase(c.env as Environment);
    const now = new Date();

    const localeParameter = c.req.query("locale");
    const locale = localeParameter || "en";

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

    // Get next period selections
    const [nextDailyMovie, nextWeeklyMovie, nextMonthlyMovie] =
      await Promise.all([
        getMovieByDateSeed(database, nextDay, "daily", locale),
        getMovieByDateSeed(database, nextFriday, "weekly", locale),
        getMovieByDateSeed(database, nextMonth, "monthly", locale),
      ]);

    return c.json({
      nextDaily: {
        date: getSelectionDate(nextDay, "daily"),
        movie: nextDailyMovie,
      },
      nextWeekly: {
        date: getSelectionDate(nextFriday, "weekly"),
        movie: nextWeeklyMovie,
      },
      nextMonthly: {
        date: getSelectionDate(nextMonth, "monthly"),
        movie: nextMonthlyMovie,
      },
    });
  } catch (error) {
    console.error("Error previewing next selections:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Admin: Override movie selection for specific date/type
app.post("/admin/override-selection", authMiddleware, async (c) => {
  try {
    const database = getDatabase(c.env as Environment);
    const { type, date, movieId } = await c.req.json();

    // Validate inputs
    if (!type || !["daily", "weekly", "monthly"].includes(type)) {
      return c.json({ error: "Invalid selection type" }, 400);
    }

    if (!date) {
      return c.json({ error: "Date is required" }, 400);
    }

    if (!movieId) {
      return c.json({ error: "Movie ID is required" }, 400);
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return c.json({ error: "Date must be in YYYY-MM-DD format" }, 400);
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

    // Delete existing selection if any
    await database
      .delete(movieSelections)
      .where(
        and(
          eq(movieSelections.selectionType, type),
          eq(movieSelections.selectionDate, date)
        )
      );

    // Insert new selection
    const newSelection = await database
      .insert(movieSelections)
      .values({
        selectionType: type,
        selectionDate: date,
        movieId: movieId,
      })
      .returning();

    return c.json({
      success: true,
      selection: newSelection[0],
    });
  } catch (error) {
    console.error("Error overriding selection:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Get movie details with all translations
app.get("/movies/:id", async (c) => {
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
app.post("/movies/:id/translations", authMiddleware, async (c) => {
  try {
    const database = getDatabase(c.env as Environment);
    const movieId = c.req.param("id");
    const { languageCode, content, isDefault = false } = await c.req.json();

    if (!languageCode || !content) {
      return c.json({ error: "languageCode and content are required" }, 400);
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
app.delete("/movies/:id/translations/:lang", authMiddleware, async (c) => {
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

// Get all movies for admin
app.get("/admin/movies", authMiddleware, async (c) => {
  try {
    const database = getDatabase(c.env as Environment);
    const page = Number(c.req.query("page") || 1);
    const limit = Number(c.req.query("limit") || 50);
    const offset = (page - 1) * limit;
    const search = c.req.query("search");

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
          eq(translations.isDefault, 1)
        )
      );

    // Apply search filter if provided
    const query = search
      ? baseQuery.where(sql`${translations.content} LIKE ${"%" + search + "%"}`)
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
          eq(translations.isDefault, 1)
        )
      );

    const countQuery = search
      ? baseCountQuery.where(sql`${translations.content} LIKE ${"%" + search + "%"}`)
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
app.delete("/admin/movies/:id", authMiddleware, async (c) => {
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
          eq(translations.resourceType, "movie_title")
        )
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

// Submit article link
app.post("/movies/:id/article-links", async (c) => {
  try {
    const database = getDatabase(c.env as Environment);
    const movieId = c.req.param("id");
    const { url, title, description } = await c.req.json();

    // Validate inputs
    if (!url || !title) {
      return c.json({ error: "URL and title are required" }, 400);
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
app.get("/movies/:id/article-links", async (c) => {
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

// Admin: Flag article as spam
app.post("/admin/article-links/:id/spam", authMiddleware, async (c) => {
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

// Admin: Add poster URL
app.post("/admin/movies/:id/posters", authMiddleware, async (c) => {
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

// Admin: Delete poster URL
app.delete(
  "/admin/movies/:movieId/posters/:posterId",
  authMiddleware,
  async (c) => {
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
  }
);

// Admin: Update movie IMDB ID
app.put("/admin/movies/:id/imdb-id", authMiddleware, async (c) => {
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
          409
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
        } = await import("../../scrapers/src/common/tmdb-utilities");

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
            c.env.TMDB_API_KEY
          );
          if (imagesData) {
            const savedPosters = await savePosterUrls(
              movieId,
              imagesData.images.posters,
              c.env as Environment
            );
            refreshResults.postersAdded = savedPosters;
          }

          // Fetch and save translations using TMDb Translations API
          let translationsAddedForImdb = 0;
          const { translations } = await import(
            "../../src/schema/translations"
          );

          // Get all translations from TMDb
          const translationsData = await fetchTMDBMovieTranslations(
            tmdbId,
            c.env.TMDB_API_KEY
          );

          if (translationsData?.translations) {
            // Find English title (original language)
            const englishTranslation = translationsData.translations.find(
              (t) => t.iso_639_1 === "en" && t.data?.title
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
              (t) => t.iso_639_1 === "ja" && t.data?.title
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

// Admin: Update movie TMDb ID
app.put("/admin/movies/:id/tmdb-id", authMiddleware, async (c) => {
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
          409
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
          "../../scrapers/src/common/tmdb-utilities"
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
          `https://api.themoviedb.org/3/movie/${tmdbId}/images`
        );
        imagesUrl.searchParams.append("api_key", c.env.TMDB_API_KEY);

        const imagesResponse = await fetch(imagesUrl.toString());
        if (imagesResponse.ok) {
          const images = (await imagesResponse.json()) as TMDBMovieImages;
          if (images.posters && images.posters.length > 0) {
            const savedPosters = await savePosterUrls(
              movieId,
              images.posters,
              c.env as Environment
            );
            refreshResults.postersAdded = savedPosters;
          }
        }

        // Fetch and save translations using TMDb Translations API
        let translationsAdded = 0;
        const database = getDatabase(c.env as Environment);
        const { translations } = await import("../../src/schema/translations");

        // Get all translations from TMDb
        const translationsData = await fetchTMDBMovieTranslations(
          tmdbId,
          c.env.TMDB_API_KEY
        );

        console.log(
          `Translations data for TMDb ID ${tmdbId}:`,
          translationsData?.translations?.length || 0,
          "translations found"
        );

        if (translationsData?.translations) {
          // Find English title (original language)
          const englishTranslation = translationsData.translations.find(
            (t) => t.iso_639_1 === "en" && t.data?.title
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
              `Saved English title: ${englishTranslation.data.title}`
            );
          }

          // Find Japanese title
          const japaneseTranslation = translationsData.translations.find(
            (t) => t.iso_639_1 === "ja" && t.data?.title
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
              `Saved Japanese title: ${japaneseTranslation.data.title}`
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

// Admin: Get award organizations, ceremonies, and categories for nomination editing
app.get("/admin/awards", authMiddleware, async (c) => {
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
        eq(awardCeremonies.organizationUid, awardOrganizations.uid)
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
        eq(awardCategories.organizationUid, awardOrganizations.uid)
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

// Admin: Add nomination
app.post("/admin/movies/:movieId/nominations", authMiddleware, async (c) => {
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
          eq(nominations.categoryUid, categoryUid)
        )
      )
      .limit(1);

    if (existingNomination.length > 0) {
      return c.json(
        {
          error:
            "Nomination already exists for this movie, ceremony, and category",
        },
        409
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

// Admin: Update nomination
app.put("/admin/nominations/:nominationId", authMiddleware, async (c) => {
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

// Admin: Delete nomination
app.delete("/admin/nominations/:nominationId", authMiddleware, async (c) => {
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

// Get URL title
app.post("/fetch-url-title", async (c) => {
  try {
    const { url } = await c.req.json();

    // Validate URL
    if (!url) {
      return c.json({ error: "URL is required" }, 400);
    }

    try {
      new URL(url);
    } catch {
      return c.json({ error: "Invalid URL format" }, 400);
    }

    // Fetch URL content
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    });

    if (!response.ok) {
      return c.json({ error: "Failed to fetch URL" }, 400);
    }

    const html = await response.text();

    // Extract title from HTML
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : "";

    if (!title) {
      return c.json({ error: "Could not extract title from URL" }, 400);
    }

    return c.json({ title });
  } catch (error) {
    console.error("Error fetching URL title:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

export default app;
