import { getDatabase, type Environment } from "db";
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
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

function getDateSeed(date: Date, type: "daily" | "weekly" | "monthly"): number {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  switch (type) {
    case "daily": {
      const dateString = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
      return simpleHash(`daily-${dateString}`);
    }
    case "weekly": {
      const daysSinceFriday = (date.getDay() - 5 + 7) % 7;
      const fridayDate = new Date(date);
      fridayDate.setDate(day - daysSinceFriday);
      const weekString = `${fridayDate.getFullYear()}-${(fridayDate.getMonth() + 1).toString().padStart(2, '0')}-${fridayDate.getDate().toString().padStart(2, '0')}`;
      return simpleHash(`weekly-${weekString}`);
    }
    case "monthly": {
      const monthString = `${year}-${month.toString().padStart(2, '0')}`;
      return simpleHash(`monthly-${monthString}`);
    }
  }
}

async function getMovieByDateSeed(
  database: ReturnType<typeof getDatabase>,
  seed: number,
  locale?: string
) {
  const preferredLanguage = locale || "en";
  
  const results = await database
    .select()
    .from(movies)
    .leftJoin(translations, and(
      eq(movies.uid, translations.resourceUid),
      eq(translations.resourceType, "movie_title"),
      eq(translations.languageCode, preferredLanguage)
    ))
    .leftJoin(posterUrls, eq(movies.uid, posterUrls.movieUid))
    .orderBy(
      sql`(ABS(${seed} % (SELECT COUNT(*) FROM movies)) + movies.rowid) % (SELECT COUNT(*) FROM movies)`
    )
    .limit(1);

  if (results.length === 0 || !results[0].translations?.content) {
    const fallbackResults = await database
      .select()
      .from(movies)
      .leftJoin(translations, and(
        eq(movies.uid, translations.resourceUid),
        eq(translations.resourceType, "movie_title"),
        eq(translations.isDefault, 1)
      ))
      .leftJoin(posterUrls, eq(movies.uid, posterUrls.movieUid))
      .orderBy(
        sql`(ABS(${seed} % (SELECT COUNT(*) FROM movies)) + movies.rowid) % (SELECT COUNT(*) FROM movies)`
      )
      .limit(1);
    
    if (fallbackResults.length > 0) {
      return fallbackResults;
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
    .split(',')
    .map(lang => {
      const [code, q] = lang.trim().split(';q=');
      return { code: code.split('-')[0], quality: q ? parseFloat(q) : 1.0 };
    })
    .sort((a, b) => b.quality - a.quality)
    .map(lang => lang.code);
}

app.get("/", async (c) => {
  try {
    const database = getDatabase(c.env as Environment);
    const now = new Date();

    const localeParam = c.req.query('locale');
    const acceptLanguage = c.req.header('accept-language');
    const preferredLanguages = localeParam ? [localeParam] : parseAcceptLanguage(acceptLanguage);
    const locale = preferredLanguages.find(lang => ['en', 'ja'].includes(lang)) || 'en';

    const dailySeed = getDateSeed(now, "daily");
    const weeklySeed = getDateSeed(now, "weekly");
    const monthlySeed = getDateSeed(now, "monthly");

    const [dailyMovie, weeklyMovie, monthlyMovie] = await Promise.all([
      getMovieByDateSeed(database, dailySeed, locale),
      getMovieByDateSeed(database, weeklySeed, locale),
      getMovieByDateSeed(database, monthlySeed, locale),
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
