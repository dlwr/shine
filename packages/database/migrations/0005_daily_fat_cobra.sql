CREATE TABLE `article_links` (
	`uid` text PRIMARY KEY NOT NULL,
	`movie_uid` text NOT NULL,
	`url` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`submitted_at` integer NOT NULL,
	`submitter_ip` text,
	`view_count` integer DEFAULT 0 NOT NULL,
	`is_spam` integer DEFAULT false NOT NULL,
	`is_flagged` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`movie_uid`) REFERENCES `movies`(`uid`) ON UPDATE no action ON DELETE cascade
);
