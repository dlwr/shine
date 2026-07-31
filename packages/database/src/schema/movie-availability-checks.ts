import {sql} from 'drizzle-orm';
import {index, integer, sqliteTable, text} from 'drizzle-orm/sqlite-core';
import {generateUUID} from '@shine/utils';
import {movies} from './movies';

export const movieAvailabilityChecks = sqliteTable(
  'movie_availability_checks',
  {
    uid: text()
      .primaryKey()
      .$defaultFn(() => generateUUID()),
    movieUid: text()
      .notNull()
      .references(() => movies.uid),
    source: text({
      enum: ['tmdb', 'unext', 'discas', 'geo'],
    }).notNull(),
    status: text({enum: ['ok', 'ng', 'error']}).notNull(),
    detail: text(),
    checkedAt: integer()
      .notNull()
      .default(sql`(unixepoch())`),
    createdAt: integer()
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer()
      .notNull()
      .default(sql`(unixepoch())`)
      .$onUpdate(() => Math.floor(Date.now() / 1000)),
  },
  table => [
    index('movie_availability_checks_movie_uid_idx').on(table.movieUid),
    index('movie_availability_checks_movie_source_checked_idx').on(
      table.movieUid,
      table.source,
      table.checkedAt,
    ),
  ],
);
