DROP INDEX `nominations_movieUid_ceremonyUid_categoryUid_unique`;--> statement-breakpoint
ALTER TABLE `nominations` ADD `person_uid` text REFERENCES people(uid);--> statement-breakpoint
CREATE UNIQUE INDEX `nominations_film_unique` ON `nominations` (`movie_uid`,`ceremony_uid`,`category_uid`) WHERE "nominations"."person_uid" is null;--> statement-breakpoint
CREATE UNIQUE INDEX `nominations_person_unique` ON `nominations` (`movie_uid`,`ceremony_uid`,`category_uid`,`person_uid`) WHERE "nominations"."person_uid" is not null;--> statement-breakpoint
CREATE INDEX `nominations_person_idx` ON `nominations` (`person_uid`);