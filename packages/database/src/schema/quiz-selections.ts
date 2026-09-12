import {sql} from 'drizzle-orm';
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import {generateUUID} from '@shine/utils';
import {movies} from './movies';

export const quizSelections = sqliteTable(
  'quiz_selections',
  {
    uid: text()
      .primaryKey()
      .$defaultFn(() => generateUUID()),
    quizDate: text('quiz_date').notNull(),
    movieUid: text('movie_uid')
      .notNull()
      .references(() => movies.uid),
    createdAt: integer('created_at')
      .notNull()
      .default(sql`(unixepoch())`),
  },
  table => [
    uniqueIndex('quiz_selections_quiz_date_unique_idx').on(table.quizDate),
    index('quiz_selections_movie_uid_idx').on(table.movieUid),
  ],
);
