CREATE TABLE `movie_selections` (
	`uid` text PRIMARY KEY NOT NULL,
	`selection_type` text NOT NULL,
	`selection_date` text NOT NULL,
	`movie_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`movie_id`) REFERENCES `movies`(`uid`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `movie_selections_selection_type_idx` ON `movie_selections` (`selection_type`);--> statement-breakpoint
CREATE INDEX `movie_selections_selection_date_idx` ON `movie_selections` (`selection_date`);--> statement-breakpoint
CREATE INDEX `movie_selections_movie_id_idx` ON `movie_selections` (`movie_id`);--> statement-breakpoint
CREATE INDEX `movie_selections_type_date_idx` ON `movie_selections` (`selection_type`,`selection_date`);