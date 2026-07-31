DROP INDEX `award_categories_name_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `award_categories_organizationUid_name_unique` ON `award_categories` (`organization_uid`,`name`);