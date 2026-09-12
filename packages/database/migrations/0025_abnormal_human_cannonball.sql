DROP INDEX `movie_credits_person_idx`;--> statement-breakpoint
CREATE INDEX `movie_credits_person_movie_job_idx` ON `movie_credits` (`person_uid`,`movie_uid`,`job`);