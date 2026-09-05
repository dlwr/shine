import {index, integer, sqliteTable, text} from 'drizzle-orm/sqlite-core';
import {generateUUID} from '@shine/utils';
import {movies} from './movies';

export const articleLinks = sqliteTable(
  'article_links',
  {
    uid: text('uid')
      .notNull()
      .primaryKey()
      .$default(() => generateUUID()),
    movieUid: text('movie_uid')
      .notNull()
      .references(() => movies.uid, {onDelete: 'cascade'}),
    url: text('url'),
    title: text('title'),
    description: text('description'),
    submittedAt: integer('submitted_at', {mode: 'timestamp'})
      .notNull()
      .$default(() => new Date()),
    submitterIp: text('submitter_ip'),
    announcedAt: integer('announced_at', {mode: 'timestamp'}),
    isSpam: integer('is_spam', {mode: 'boolean'}).notNull().default(false),
    isFlagged: integer('is_flagged', {mode: 'boolean'})
      .notNull()
      .default(false),
  },
  table => [index('article_links_movie_idx').on(table.movieUid)],
);
