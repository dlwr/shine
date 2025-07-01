import {integer, sqliteTable, text} from 'drizzle-orm/sqlite-core';
import {generateUUID} from '../utils/uuid';
import {movies} from './movies';

export const articleLinks = sqliteTable('article_links', {
	uid: text('uid')
		.notNull()
		.primaryKey()
		.$default(() => generateUUID()),
	movieUid: text('movie_uid')
		.notNull()
		.references(() => movies.uid, {onDelete: 'cascade'}),
	url: text('url').notNull(),
	title: text('title').notNull(),
	description: text('description'),
	submittedAt: integer('submitted_at', {mode: 'timestamp'})
		.notNull()
		.$default(() => new Date()),
	submitterIp: text('submitter_ip'),
	isSpam: integer('is_spam', {mode: 'boolean'}).notNull().default(false),
	isFlagged: integer('is_flagged', {mode: 'boolean'}).notNull().default(false),
});
