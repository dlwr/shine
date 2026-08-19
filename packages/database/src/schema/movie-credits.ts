import {sql} from 'drizzle-orm';
import {index, integer, sqliteTable, text} from 'drizzle-orm/sqlite-core';
import {generateUUID} from '@shine/utils';
import {movies} from './movies';
import {people} from './people';

export const movieCredits = sqliteTable(
  'movie_credits',
  {
    uid: text()
      .primaryKey()
      .$defaultFn(() => generateUUID()),
    movieUid: text()
      .notNull()
      .references(() => movies.uid),
    personUid: text()
      .notNull()
      .references(() => people.uid),
    creditId: text().notNull().unique(),
    department: text().notNull(),
    job: text(),
    character: text(),
    castOrder: integer(),
    createdAt: integer()
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer()
      .notNull()
      .default(sql`(unixepoch())`)
      .$onUpdate(() => Math.floor(Date.now() / 1000)),
  },
  table => [
    index('movie_credits_movie_idx').on(table.movieUid),
    index('movie_credits_person_idx').on(table.personUid),
  ],
);
