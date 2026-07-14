CREATE TABLE `poster_urls` (
	`uid` text PRIMARY KEY NOT NULL,
	`movie_uid` text NOT NULL,
	`url` text NOT NULL,
	`width` integer,
	`height` integer,
	`language_code` text,
	`country_code` text,
	`source_type` text,
	`is_primary` integer DEFAULT 0,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`movie_uid`) REFERENCES `movies`(`uid`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `poster_urls_movie_idx` ON `poster_urls` (`movie_uid`);--> statement-breakpoint
CREATE INDEX `poster_urls_primary_idx` ON `poster_urls` (`movie_uid`,`is_primary`);--> statement-breakpoint
CREATE UNIQUE INDEX `poster_urls_unique_idx` ON `poster_urls` (`movie_uid`,`width`,`height`,`language_code`,`country_code`);