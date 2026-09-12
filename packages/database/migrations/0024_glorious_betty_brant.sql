CREATE TABLE `quiz_selections` (
	`uid` text PRIMARY KEY NOT NULL,
	`quiz_date` text NOT NULL,
	`movie_uid` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`movie_uid`) REFERENCES `movies`(`uid`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quiz_selections_quiz_date_unique_idx` ON `quiz_selections` (`quiz_date`);--> statement-breakpoint
CREATE INDEX `quiz_selections_movie_uid_idx` ON `quiz_selections` (`movie_uid`);