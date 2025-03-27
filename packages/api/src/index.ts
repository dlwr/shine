import { movies } from "@shine/db/schema/movies";
import { translations } from "@shine/db/schema/translations";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { getDatabase, sql } from "./database";

const app = new Hono();

app.use("*", cors());

app.get("/", async (c) => {
  try {
    const { db, client } = getDatabase();

    const results = await db
      .select()
      .from(movies)
      .leftJoin(translations, eq(movies.uid, translations.resourceUid))
      .where(
        and(
          eq(movies.originalLanguage, translations.languageCode),
          eq(translations.resourceType, "movie_title")
        )
      )
      .orderBy(sql`RANDOM()`)
      .limit(1);

    await client.end();

    if (results.length === 0) {
      return c.json({ error: "No movies found" }, 404);
    }

    const { movies: movie, translations: translation } = results[0];

    return c.json({
      movie: {
        uid: movie.uid,
        year: movie.year,
        originalLanguage: movie.originalLanguage,
        title: translation?.content,
      },
    });
  } catch (error) {
    console.error("Error fetching random movie:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

export default app;
