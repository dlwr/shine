import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { generateUUID } from "../utils/uuid";
import { movies } from "./movies";

export const referenceUrls = sqliteTable(
  "reference_urls",
  {
    uid: text()
      .primaryKey()
      .$defaultFn(() => generateUUID()),
    movieUid: text()
      .notNull()
      .references(() => movies.uid),
    url: text().notNull(),
    sourceType: text({
      enum: ["wikipedia", "imdb", "official", "other"],
    }).notNull(),
    languageCode: text().notNull(),
    countryCode: text(),
    description: text(),
    isPrimary: integer().default(0),
    createdAt: integer()
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer()
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    unique().on(table.movieUid, table.sourceType, table.languageCode),
  ],
);

export const referenceUrlsIndexes = {
  movieUidIdx:
    "CREATE INDEX reference_urls_movie_uid_idx ON reference_urls (movie_uid)",
  movieLanguageIdx:
    "CREATE INDEX reference_urls_movie_language_idx ON reference_urls (movie_uid, language_code)",
  movieSourceLanguageIdx:
    "CREATE INDEX reference_urls_movie_source_language_idx ON reference_urls (movie_uid, source_type, language_code)",
};
