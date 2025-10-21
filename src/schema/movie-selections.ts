import {sql} from 'drizzle-orm';
import {index, integer, sqliteTable, text} from 'drizzle-orm/sqlite-core';
import {generateUUID} from '../utils/uuid';
import {movies} from './movies';

export const movieSelections = sqliteTable(
  'movie_selections',
  {
    uid: text()
      .primaryKey()
      .$defaultFn(() => generateUUID()),
    selectionType: text('selection_type', {
      enum: ['daily', 'weekly', 'monthly'],
    }).notNull(),
    selectionDate: text('selection_date').notNull(), // YYYY-MM-DD format
    movieId: text('movie_id')
      .notNull()
      .references(() => movies.uid),
    createdAt: integer('created_at')
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at')
      .notNull()
      .default(sql`(unixepoch())`),
  },
  table => ({
    selectionTypeIdx: index('movie_selections_selection_type_idx').on(
      table.selectionType,
    ),
    selectionDateIdx: index('movie_selections_selection_date_idx').on(
      table.selectionDate,
    ),
    movieIdIdx: index('movie_selections_movie_id_idx').on(table.movieId),
    typeAndDateIdx: index('movie_selections_type_date_idx').on(
      table.selectionType,
      table.selectionDate,
    ),
  }),
);
