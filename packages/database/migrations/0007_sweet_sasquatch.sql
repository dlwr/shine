CREATE INDEX `movies_year_idx` ON `movies` (`year`);--> statement-breakpoint
CREATE INDEX `movies_original_language_idx` ON `movies` (`original_language`);--> statement-breakpoint
CREATE INDEX `movies_created_at_idx` ON `movies` (`created_at`);--> statement-breakpoint
CREATE INDEX `translations_resource_type_idx` ON `translations` (`resource_type`);--> statement-breakpoint
CREATE INDEX `translations_resource_uid_idx` ON `translations` (`resource_uid`);--> statement-breakpoint
CREATE INDEX `translations_language_code_idx` ON `translations` (`language_code`);