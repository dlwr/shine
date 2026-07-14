CREATE TABLE `movie_availability_checks` (
	`uid` text PRIMARY KEY NOT NULL,
	`movie_uid` text NOT NULL,
	`source` text NOT NULL,
	`status` text NOT NULL,
	`detail` text,
	`checked_at` integer DEFAULT (unixepoch()) NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`movie_uid`) REFERENCES `movies`(`uid`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `movie_availability_checks_movie_uid_idx` ON `movie_availability_checks` (`movie_uid`);--> statement-breakpoint
CREATE INDEX `movie_availability_checks_movie_source_checked_idx` ON `movie_availability_checks` (`movie_uid`,`source`,`checked_at`);