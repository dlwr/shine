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
  const month = date.getMonth() + 1;
  const day = date.getDate();

  const DAILY_PRIME = 73_939_133;
  const WEEKLY_PRIME = 47_158_511;
  const MONTHLY_PRIME = 28_657;

  switch (type) {
    case "daily": {
      const base = year * 10_000 + month * 100 + day;
      return (
        (((base ^ 10_870_693) * DAILY_PRIME) % 1_000_000_000) + 1_000_000_000
      );
    }
    case "weekly": {
      const daysSinceFriday = (date.getDay() - 5 + 7) % 7;
      const fridayDate = new Date(date);
      fridayDate.setDate(day - daysSinceFriday);
      const base =
        fridayDate.getFullYear() * 10_000 +
        (fridayDate.getMonth() + 1) * 100 +
        fridayDate.getDate();
      return (
        (((base ^ 15_790_320) * WEEKLY_PRIME) % 1_000_000_000) + 2_000_000_000
      );
    }
    case "monthly": {
      const base = year * 100 + month;
      return (
        (((base ^ 3_947_580) * MONTHLY_PRIME) % 1_000_000_000) + 3_000_000_000
      );
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
        eq(translations.resourceType, "movie_title")
      )
    )
    .orderBy(sql`RANDOM()`)
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
