import { getDatabase, type Environment } from "db";
import { movieSelections } from "db/schema/movie-selections";
import { movies } from "db/schema/movies";
import { posterUrls } from "db/schema/poster-urls";
import { translations } from "db/schema/translations";
import { and, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";

const app = new Hono();

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

async function getMovieByDateSeed(
  database: ReturnType<typeof getDatabase>,
  date: Date,
  type: "daily" | "weekly" | "monthly",
  preferredLanguage = "en"
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

  if (existingSelection.length > 0) {
    // Use the existing selection
    movieId = existingSelection[0].movieId;
  } else {
    // Generate a new selection
    const seed = getDateSeed(date, type);

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

    // Save the new selection to the database
    try {
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

      return {
        uid: movie.uid,
        year: movie.year,
        originalLanguage: movie.originalLanguage,
        title: translation?.content,
        posterUrl: poster?.url,
        imdbUrl: imdbUrl,
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

  return {
    uid: movie.uid,
    year: movie.year,
    originalLanguage: movie.originalLanguage,
    title: translation?.content,
    posterUrl: poster?.url,
    imdbUrl: imdbUrl,
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

export default app;
