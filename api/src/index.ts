import { and, eq, getDatabase, sql, type Environment } from "db";
import { awardCategories } from "db/schema/award-categories";
import { awardCeremonies } from "db/schema/award-ceremonies";
import { awardOrganizations } from "db/schema/award-organizations";
import { movieSelections } from "db/schema/movie-selections";
import { movies } from "db/schema/movies";
import { nominations } from "db/schema/nominations";
import { posterUrls } from "db/schema/poster-urls";
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
      .select()
      .from(posterUrls)
      .where(eq(posterUrls.movieUid, movieId));

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
      imdbUrl: imdbUrl,
      posterUrl: posterResult[0]?.url,
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

    // Get total count
    const countResult = await database
      .select({ count: sql`count(*)`.as("count") })
      .from(movies);

    const totalCount = Number(countResult[0].count);

    // Get movies with default translations and first poster URL
    const moviesResult = await database
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
      )
      .orderBy(sql`${movies.createdAt} DESC`)
      .limit(limit)
      .offset(offset);

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
    // 1. Delete movie selections
    await database
      .delete(movieSelections)
      .where(eq(movieSelections.movieId, movieId));

    // 2. Delete nominations
    await database
      .delete(nominations)
      .where(eq(nominations.movieUid, movieId));

    // 3. Delete translations
    await database
      .delete(translations)
      .where(
        and(
          eq(translations.resourceUid, movieId),
          eq(translations.resourceType, "movie_title")
        )
      );

    // 4. Delete poster URLs
    await database
      .delete(posterUrls)
      .where(eq(posterUrls.movieUid, movieId));

    // 5. Finally delete the movie
    await database
      .delete(movies)
      .where(eq(movies.uid, movieId));

    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting movie:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

export default app;
