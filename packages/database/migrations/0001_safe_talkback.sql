ALTER TABLE `movies` ADD `imdb_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `movies_imdbId_unique` ON `movies` (`imdb_id`);