CREATE TABLE `movie_credits` (
	`uid` text PRIMARY KEY NOT NULL,
	`movie_uid` text NOT NULL,
	`person_uid` text NOT NULL,
	`credit_id` text NOT NULL,
	`department` text NOT NULL,
	`job` text,
	`character` text,
	`cast_order` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`movie_uid`) REFERENCES `movies`(`uid`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`person_uid`) REFERENCES `people`(`uid`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `movie_credits_creditId_unique` ON `movie_credits` (`credit_id`);--> statement-breakpoint
CREATE INDEX `movie_credits_movie_idx` ON `movie_credits` (`movie_uid`);--> statement-breakpoint
CREATE INDEX `movie_credits_person_idx` ON `movie_credits` (`person_uid`);--> statement-breakpoint
CREATE TABLE `people` (
	`uid` text PRIMARY KEY NOT NULL,
	`tmdb_id` integer NOT NULL,
	`name` text NOT NULL,
	`profile_path` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `people_tmdbId_unique` ON `people` (`tmdb_id`);--> statement-breakpoint
CREATE INDEX `people_name_idx` ON `people` (`name`);