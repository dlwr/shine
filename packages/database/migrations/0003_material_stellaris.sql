ALTER TABLE `movies` ADD `tmdb_id` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `movies_tmdbId_unique` ON `movies` (`tmdb_id`);