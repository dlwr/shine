import {sql} from 'drizzle-orm';
import {index, integer, sqliteTable, text} from 'drizzle-orm/sqlite-core';
import {generateUUID} from '@shine/utils';

export const people = sqliteTable(
  'people',
  {
    uid: text()
      .primaryKey()
      .$defaultFn(() => generateUUID()),
    tmdbId: integer().notNull().unique(),
    name: text().notNull(),
    profilePath: text(),
    createdAt: integer()
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer()
      .notNull()
      .default(sql`(unixepoch())`)
      .$onUpdate(() => Math.floor(Date.now() / 1000)),
  },
  table => [index('people_name_idx').on(table.name)],
);
