import {sql} from 'drizzle-orm';
import {
  index,
  integer,
  sqliteTable,
  text,
  unique,
} from 'drizzle-orm/sqlite-core';
import {generateUUID} from '@shine/utils';
import {movies} from './movies';

export const referenceUrls = sqliteTable(
  'reference_urls',
  {
    uid: text()
      .primaryKey()
      .$defaultFn(() => generateUUID()),
    movieUid: text()
      .notNull()
      .references(() => movies.uid),
    url: text().notNull(),
    sourceType: text({
      enum: ['wikipedia', 'imdb', 'official', 'other'],
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
  table => [
    unique().on(table.movieUid, table.sourceType, table.languageCode),
    index('reference_urls_movie_language_idx').on(
      table.movieUid,
      table.languageCode,
    ),
  ],
);
