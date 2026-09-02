import {sql} from 'drizzle-orm';
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import {generateUUID} from '@shine/utils';
import {awardCategories} from './award-categories';
import {awardCeremonies} from './award-ceremonies';
import {movies} from './movies';
import {people} from './people';

export const nominations = sqliteTable(
  'nominations',
  {
    uid: text()
      .primaryKey()
      .$defaultFn(() => generateUUID()),
    movieUid: text()
      .notNull()
      .references(() => movies.uid),
    ceremonyUid: text()
      .notNull()
      .references(() => awardCeremonies.uid),
    categoryUid: text()
      .notNull()
      .references(() => awardCategories.uid),
    personUid: text().references(() => people.uid),
    isWinner: integer().notNull().default(0),
    specialMention: text(),
    createdAt: integer()
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer()
      .notNull()
      .default(sql`(unixepoch())`)
      .$onUpdate(() => Math.floor(Date.now() / 1000)),
  },
  table => [
    uniqueIndex('nominations_film_unique')
      .on(table.movieUid, table.ceremonyUid, table.categoryUid)
      .where(sql`${table.personUid} is null`),
    uniqueIndex('nominations_person_unique')
      .on(table.movieUid, table.ceremonyUid, table.categoryUid, table.personUid)
      .where(sql`${table.personUid} is not null`),
    index('nominations_ceremony_category_idx').on(
      table.ceremonyUid,
      table.categoryUid,
    ),
    index('nominations_category_movie_idx').on(
      table.categoryUid,
      table.movieUid,
    ),
    index('nominations_person_idx').on(table.personUid),
    index('nominations_movie_idx').on(table.movieUid),
  ],
);
