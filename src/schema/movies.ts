import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { generateUUID } from "../utils/uuid";

export const movies = sqliteTable(
  "movies",
  {
    uid: text()
      .primaryKey()
      .$defaultFn(() => generateUUID()),
    originalLanguage: text().notNull().default("en"),
    year: integer(),
    imdbId: text().unique(),
    tmdbId: integer().unique(),
    createdAt: integer()
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer()
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    index("movies_year_idx").on(table.year),
    index("movies_original_language_idx").on(table.originalLanguage),
    index("movies_created_at_idx").on(table.createdAt),
  ],
);
