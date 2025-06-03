import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { generateUUID } from "../utils/uuid.js";

export const movies = sqliteTable("movies", {
  uid: text()
    .primaryKey()
    .$defaultFn(() => generateUUID()),
  originalLanguage: text().notNull().default("en"),
  year: integer(),
  imdbId: text().unique(),
  createdAt: integer()
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer()
    .notNull()
    .default(sql`(unixepoch())`),
});
