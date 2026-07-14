CREATE TABLE `award_organizations` (
	`uid` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`short_name` text,
	`country` text,
	`established_year` integer,
	`description` text,
	`frequency` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `award_categories` (
	`uid` text PRIMARY KEY NOT NULL,
	`organization_uid` text NOT NULL,
	`name` text NOT NULL,
	`name_en` text,
	`name_local` text,
	`short_name` text,
	`description` text,
	`first_awarded_year` integer,
	`discontinued_year` integer,
	`is_active` integer DEFAULT 1,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_uid`) REFERENCES `award_organizations`(`uid`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `award_ceremonies` (
	`uid` text PRIMARY KEY NOT NULL,
	`organization_uid` text NOT NULL,
	`ceremony_number` integer,
	`year` integer NOT NULL,
	`start_date` integer,
	`end_date` integer,
	`location` text,
	`description` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`organization_uid`) REFERENCES `award_organizations`(`uid`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `movies` (
	`uid` text PRIMARY KEY NOT NULL,
	`original_language` text DEFAULT 'en' NOT NULL,
	`year` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `nominations` (
	`uid` text PRIMARY KEY NOT NULL,
	`movie_uid` text NOT NULL,
	`ceremony_uid` text NOT NULL,
	`category_uid` text NOT NULL,
	`is_winner` integer DEFAULT 0 NOT NULL,
	`special_mention` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`movie_uid`) REFERENCES `movies`(`uid`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ceremony_uid`) REFERENCES `award_ceremonies`(`uid`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_uid`) REFERENCES `award_categories`(`uid`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `reference_urls` (
	`uid` text PRIMARY KEY NOT NULL,
	`movie_uid` text NOT NULL,
	`url` text NOT NULL,
	`source_type` text NOT NULL,
	`language_code` text NOT NULL,
	`country_code` text,
	`description` text,
	`is_primary` integer DEFAULT 0,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`movie_uid`) REFERENCES `movies`(`uid`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `translations` (
	`uid` text PRIMARY KEY NOT NULL,
	`resource_type` text NOT NULL,
	`resource_uid` text NOT NULL,
	`language_code` text NOT NULL,
	`content` text NOT NULL,
	`is_default` integer DEFAULT 0,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `award_organizations_name_unique` ON `award_organizations` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `award_organizations_shortName_unique` ON `award_organizations` (`short_name`);--> statement-breakpoint
CREATE UNIQUE INDEX `award_categories_name_unique` ON `award_categories` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `award_categories_organizationUid_shortName_unique` ON `award_categories` (`organization_uid`,`short_name`);--> statement-breakpoint
CREATE UNIQUE INDEX `award_ceremonies_organizationUid_year_unique` ON `award_ceremonies` (`organization_uid`,`year`);--> statement-breakpoint
CREATE UNIQUE INDEX `award_ceremonies_organizationUid_ceremonyNumber_unique` ON `award_ceremonies` (`organization_uid`,`ceremony_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `nominations_movieUid_ceremonyUid_categoryUid_unique` ON `nominations` (`movie_uid`,`ceremony_uid`,`category_uid`);--> statement-breakpoint
CREATE UNIQUE INDEX `reference_urls_movieUid_sourceType_languageCode_unique` ON `reference_urls` (`movie_uid`,`source_type`,`language_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `translations_resourceType_resourceUid_languageCode_unique` ON `translations` (`resource_type`,`resource_uid`,`language_code`);