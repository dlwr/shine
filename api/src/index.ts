import { getDatabase, type Environment } from "db";
import { movies } from "db/schema/movies";
import { posterUrls } from "db/schema/poster-urls";
import { translations } from "db/schema/translations";
import { and, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";

const app = new Hono();

app.use("*", cors());

app.get("/", async (c) => {
  try {
    const database = getDatabase(c.env as Environment);

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
      .orderBy(sql`RANDOM()`)
      .limit(1);

    if (results.length === 0) {
      return c.json({ error: "No movies found" }, 404);
    }

    const {
      movies: movie,
      translations: translation,
      poster_urls: poster,
    } = results[0];

    const imdbUrl = movie.imdbId
      ? `https://www.imdb.com/title/${movie.imdbId}/`
      : undefined;

    return c.json({
      movie: {
        uid: movie.uid,
        year: movie.year,
        originalLanguage: movie.originalLanguage,
        title: translation?.content,
        poster_url: poster?.url,
        imdb_url: imdbUrl,
      },
    });
  } catch (error) {
    console.error("Error fetching random movie:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

export default app;
