PRAGMA defer_foreign_keys = on;--> statement-breakpoint
CREATE TABLE `__new_article_links` (
	`uid` text PRIMARY KEY NOT NULL,
	`movie_uid` text NOT NULL,
	`url` text,
	`title` text,
	`description` text,
	`submitted_at` integer NOT NULL,
	`submitter_ip` text,
	`is_spam` integer DEFAULT false NOT NULL,
	`is_flagged` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`movie_uid`) REFERENCES `movies`(`uid`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_article_links`("uid", "movie_uid", "url", "title", "description", "submitted_at", "submitter_ip", "is_spam", "is_flagged") SELECT "uid", "movie_uid", "url", "title", "description", "submitted_at", "submitter_ip", "is_spam", "is_flagged" FROM `article_links`;--> statement-breakpoint
DROP TABLE `article_links`;--> statement-breakpoint
ALTER TABLE `__new_article_links` RENAME TO `article_links`;--> statement-breakpoint
CREATE INDEX `article_links_movie_idx` ON `article_links` (`movie_uid`);
