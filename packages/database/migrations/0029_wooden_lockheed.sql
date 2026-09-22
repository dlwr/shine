CREATE TABLE `watched_marks` (
	`uid` text PRIMARY KEY NOT NULL,
	`movie_uid` text NOT NULL,
	`submitter_ip` text NOT NULL,
	`marked_at` integer NOT NULL,
	`is_owner` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`movie_uid`) REFERENCES `movies`(`uid`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `watched_marks_movie_ip_unique_idx` ON `watched_marks` (`movie_uid`,`submitter_ip`);--> statement-breakpoint
CREATE INDEX `watched_marks_ip_marked_at_idx` ON `watched_marks` (`submitter_ip`,`marked_at`);