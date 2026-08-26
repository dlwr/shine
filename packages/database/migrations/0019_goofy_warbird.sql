DROP INDEX `movies_tmdbId_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `movies_tmdb_id_media_type_unique` ON `movies` (`tmdb_id`,`media_type`);