DROP INDEX `movies_deleted_at_idx`;--> statement-breakpoint
CREATE INDEX `movies_deleted_at_uid_idx` ON `movies` (`deleted_at`,`uid`);