import { getDatabase, type Environment } from "db";
import { movies } from "db/schema/movies";
import { posterUrls } from "db/schema/poster-urls";
import { translations } from "db/schema/translations";
import { and, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";

const app = new Hono();

app.use("*", cors());

function getDateSeed(date: Date, type: "daily" | "weekly" | "monthly"): number {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();

  switch (type) {
    case "daily": {
      return year * 10_000 + month * 100 + day;
    }
    case "weekly": {
      const daysSinceFriday = (date.getDay() - 5 + 7) % 7;
      const fridayDate = new Date(date);
      fridayDate.setDate(day - daysSinceFriday);
      return (
        fridayDate.getFullYear() * 10_000 +
        fridayDate.getMonth() * 100 +
        fridayDate.getDate()
      );
    }
    case "monthly": {
      return year * 100 + month;
    }
  }
}

async function getMovieByDateSeed(
  database: ReturnType<typeof getDatabase>,
  seed: number
) {
  const results = await database
    .select()
    .from(movies)
    .leftJoin(translations, eq(movies.uid, translations.resourceUid))
    .leftJoin(posterUrls, eq(movies.uid, posterUrls.movieUid))
    .where(
      and(
        eq(movies.originalLanguage, translations.languageCode),
        eq(translations.resourceType, "movie_title"),
        eq(posterUrls.isPrimary, 1),
        eq(posterUrls.languageCode, translations.languageCode)
      )
    )
    .orderBy(
      sql`(ABS(${seed} % (SELECT COUNT(*) FROM movies)) + movies.rowid) % (SELECT COUNT(*) FROM movies)`
    )
    .limit(1);

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

app.get("/", async (c) => {
  try {
    const database = getDatabase(c.env as Environment);
    const now = new Date();

    const dailySeed = getDateSeed(now, "daily");
    const weeklySeed = getDateSeed(now, "weekly");
    const monthlySeed = getDateSeed(now, "monthly");

    const [dailyMovie, weeklyMovie, monthlyMovie] = await Promise.all([
      getMovieByDateSeed(database, dailySeed),
      getMovieByDateSeed(database, weeklySeed),
      getMovieByDateSeed(database, monthlySeed),
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
