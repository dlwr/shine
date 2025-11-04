import {sql} from 'drizzle-orm';
import {integer, sqliteTable, text, unique} from 'drizzle-orm/sqlite-core';
import {generateUUID} from '@shine/utils';
import {awardOrganizations} from './award-organizations';

export const awardCeremonies = sqliteTable(
  'award_ceremonies',
  {
    uid: text('uid')
      .primaryKey()
      .$defaultFn(() => generateUUID()),
    organizationUid: text()
      .notNull()
      .references(() => awardOrganizations.uid),
    ceremonyNumber: integer(),
    year: integer().notNull(),
    startDate: integer(),
    endDate: integer(),
    location: text(),
    description: text(),
    imdbEventUrl: text('imdb_event_url'),
    createdAt: integer()
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer()
      .notNull()
      .default(sql`(unixepoch())`),
  },
  table => [
    unique().on(table.organizationUid, table.year),
    unique().on(table.organizationUid, table.ceremonyNumber),
  ],
);
