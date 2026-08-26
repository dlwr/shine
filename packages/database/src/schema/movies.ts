import {sql} from 'drizzle-orm';
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import {generateUUID} from '@shine/utils';

export const movies = sqliteTable(
  'movies',
  {
    uid: text()
      .primaryKey()
      .$defaultFn(() => generateUUID()),
    originalLanguage: text().notNull().default('en'),
    year: integer(),
    imdbId: text().unique(),
    tmdbId: integer(),
    mediaType: text().notNull().default('movie'),
    releaseDate: text('release_date'),
    createdAt: integer()
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer()
      .notNull()
      .default(sql`(unixepoch())`)
      .$onUpdate(() => Math.floor(Date.now() / 1000)),
    deletedAt: integer('deleted_at'),
  },
  table => [
    index('movies_year_idx').on(table.year),
    index('movies_original_language_idx').on(table.originalLanguage),
    index('movies_created_at_idx').on(table.createdAt),
    index('movies_deleted_at_idx').on(table.deletedAt),
    uniqueIndex('movies_tmdb_id_media_type_unique').on(
      table.tmdbId,
      table.mediaType,
    ),
  ],
);
