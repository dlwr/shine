import {sql} from 'drizzle-orm';
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import {generateUUID} from '../utils/uuid';
import {movies} from './movies';

export const posterUrls = sqliteTable(
  'poster_urls',
  {
    uid: text()
      .primaryKey()
      .$defaultFn(() => generateUUID()),
    movieUid: text()
      .notNull()
      .references(() => movies.uid),
    url: text().notNull(),
    width: integer(),
    height: integer(),
    languageCode: text(),
    countryCode: text(),
    sourceType: text(),
    isPrimary: integer().default(0),
    createdAt: integer()
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer()
      .notNull()
      .default(sql`(unixepoch())`),
  },
  table => [
    index('poster_urls_movie_idx').on(table.movieUid),
    index('poster_urls_primary_idx').on(table.movieUid, table.isPrimary),
    uniqueIndex('poster_urls_unique_idx').on(
      table.movieUid,
      table.width,
      table.height,
      table.languageCode,
      table.countryCode,
    ),
  ],
);
