import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { movies } from "./movies";

export const sourceTypeEnum = pgEnum("source_type", [
  "wikipedia",
  "imdb",
  "official",
  "other",
]);

export const referenceUrls = pgTable(
  "reference_urls",
  {
    uid: uuid()
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    movieUid: uuid()
      .references(() => movies.uid)
      .notNull(),
    url: text().notNull(),
    sourceType: sourceTypeEnum().notNull(),
    languageCode: char({ length: 2 }).notNull(),
    countryCode: char({ length: 2 }),
    description: text(),
    isPrimary: boolean().default(false),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull().defaultNow(),
  },
  (table) => ({
    movieSourceLanguageUnique: unique().on(
      table.movieUid,
      table.sourceType,
      table.languageCode
    ),
  })
);

export const referenceUrlsIndexes = {
  movieUidIdx:
    "CREATE INDEX reference_urls_movie_uid_idx ON reference_urls (movie_uid)",
  movieLanguageIdx:
    "CREATE INDEX reference_urls_movie_language_idx ON reference_urls (movie_uid, language_code)",
  movieSourceLanguageIdx:
    "CREATE INDEX reference_urls_movie_source_language_idx ON reference_urls (movie_uid, source_type, language_code)",
};
