ALTER TABLE `people` ADD `birthday` text;--> statement-breakpoint
CREATE INDEX `people_birthday_month_day_idx` ON `people` (substr(`birthday`, 6, 5));
