import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import {generateUUID} from '@shine/utils';
import {movies} from './movies';

export const watchedMarks = sqliteTable(
  'watched_marks',
  {
    uid: text()
      .primaryKey()
      .$defaultFn(() => generateUUID()),
    movieUid: text('movie_uid')
      .notNull()
      .references(() => movies.uid),
    submitterIp: text('submitter_ip').notNull(),
    markedAt: integer('marked_at', {mode: 'timestamp'})
      .notNull()
      .$default(() => new Date()),
    isOwner: integer('is_owner', {mode: 'boolean'}).notNull().default(false),
  },
  table => [
    uniqueIndex('watched_marks_movie_ip_unique_idx').on(
      table.movieUid,
      table.submitterIp,
    ),
    index('watched_marks_ip_marked_at_idx').on(
      table.submitterIp,
      table.markedAt,
    ),
  ],
);
