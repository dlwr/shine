ALTER TABLE `movies` ADD `deleted_at` integer;
--> statement-breakpoint
CREATE INDEX `movies_deleted_at_idx` ON `movies` (`deleted_at`);
