DROP INDEX `movie_selections_type_date_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `movie_selections_type_date_unique_idx` ON `movie_selections` (`selection_type`,`selection_date`);