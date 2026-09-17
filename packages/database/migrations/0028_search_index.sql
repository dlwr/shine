CREATE TABLE `person_search_entries` (
	`id` integer PRIMARY KEY,
	`source_uid` text NOT NULL,
	`person_uid` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `person_search_entries_source_uid_unique` ON `person_search_entries` (`source_uid`);
--> statement-breakpoint
CREATE VIRTUAL TABLE `person_search` USING fts5(terms, tokenize = 'unicode61');
--> statement-breakpoint
CREATE TABLE `movie_search_entries` (
	`id` integer PRIMARY KEY,
	`source_uid` text NOT NULL,
	`movie_uid` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `movie_search_entries_source_uid_unique` ON `movie_search_entries` (`source_uid`);
--> statement-breakpoint
CREATE VIRTUAL TABLE `movie_search` USING fts5(terms, tokenize = 'unicode61');
--> statement-breakpoint
INSERT INTO person_search_entries (source_uid, person_uid)
SELECT uid, uid FROM people;
--> statement-breakpoint
INSERT INTO person_search_entries (source_uid, person_uid)
SELECT uid, resource_uid FROM translations WHERE resource_type = 'person_name';
--> statement-breakpoint
INSERT INTO movie_search_entries (source_uid, movie_uid)
SELECT uid, resource_uid FROM translations WHERE resource_type = 'movie_title';
--> statement-breakpoint
INSERT INTO person_search (rowid, terms)
SELECT person_search_entries.id, (
	WITH RECURSIVE positions(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM positions WHERE i < length(people.name) - 1)
	SELECT group_concat(bigram, ' ') FROM (SELECT substr(people.name, i, 2) AS bigram FROM positions ORDER BY i)
)
FROM person_search_entries
JOIN people ON people.uid = person_search_entries.source_uid;
--> statement-breakpoint
INSERT INTO person_search (rowid, terms)
SELECT person_search_entries.id, (
	WITH RECURSIVE positions(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM positions WHERE i < length(translations.content) - 1)
	SELECT group_concat(bigram, ' ') FROM (SELECT substr(translations.content, i, 2) AS bigram FROM positions ORDER BY i)
)
FROM person_search_entries
JOIN translations ON translations.uid = person_search_entries.source_uid;
--> statement-breakpoint
INSERT INTO movie_search (rowid, terms)
SELECT movie_search_entries.id, (
	WITH RECURSIVE positions(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM positions WHERE i < length(translations.content) - 1)
	SELECT group_concat(bigram, ' ') FROM (SELECT substr(translations.content, i, 2) AS bigram FROM positions ORDER BY i)
)
FROM movie_search_entries
JOIN translations ON translations.uid = movie_search_entries.source_uid;
--> statement-breakpoint
INSERT INTO person_search (person_search) VALUES ('optimize');
--> statement-breakpoint
INSERT INTO movie_search (movie_search) VALUES ('optimize');
--> statement-breakpoint
CREATE TRIGGER `people_search_insert` AFTER INSERT ON `people`
BEGIN
	INSERT INTO person_search_entries (source_uid, person_uid) VALUES (new.uid, new.uid);
	INSERT INTO person_search (rowid, terms)
	SELECT id, (
		WITH RECURSIVE positions(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM positions WHERE i < length(new.name) - 1)
		SELECT group_concat(bigram, ' ') FROM (SELECT substr(new.name, i, 2) AS bigram FROM positions ORDER BY i)
	)
	FROM person_search_entries WHERE source_uid = new.uid;
END;
--> statement-breakpoint
CREATE TRIGGER `people_search_update` AFTER UPDATE OF name ON `people`
WHEN old.name IS NOT new.name
BEGIN
	DELETE FROM person_search WHERE rowid = (SELECT id FROM person_search_entries WHERE source_uid = old.uid);
	INSERT INTO person_search (rowid, terms)
	SELECT id, (
		WITH RECURSIVE positions(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM positions WHERE i < length(new.name) - 1)
		SELECT group_concat(bigram, ' ') FROM (SELECT substr(new.name, i, 2) AS bigram FROM positions ORDER BY i)
	)
	FROM person_search_entries WHERE source_uid = old.uid;
END;
--> statement-breakpoint
CREATE TRIGGER `people_search_delete` AFTER DELETE ON `people`
BEGIN
	DELETE FROM person_search WHERE rowid = (SELECT id FROM person_search_entries WHERE source_uid = old.uid);
	DELETE FROM person_search_entries WHERE source_uid = old.uid;
END;
--> statement-breakpoint
CREATE TRIGGER `translations_person_search_insert` AFTER INSERT ON `translations`
WHEN new.resource_type = 'person_name'
BEGIN
	INSERT INTO person_search_entries (source_uid, person_uid) VALUES (new.uid, new.resource_uid);
	INSERT INTO person_search (rowid, terms)
	SELECT id, (
		WITH RECURSIVE positions(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM positions WHERE i < length(new.content) - 1)
		SELECT group_concat(bigram, ' ') FROM (SELECT substr(new.content, i, 2) AS bigram FROM positions ORDER BY i)
	)
	FROM person_search_entries WHERE source_uid = new.uid;
END;
--> statement-breakpoint
CREATE TRIGGER `translations_person_search_update` AFTER UPDATE OF resource_type, resource_uid, content ON `translations`
WHEN (old.resource_type = 'person_name' OR new.resource_type = 'person_name')
	AND (old.resource_type IS NOT new.resource_type OR old.resource_uid IS NOT new.resource_uid OR old.content IS NOT new.content)
BEGIN
	DELETE FROM person_search WHERE rowid = (SELECT id FROM person_search_entries WHERE source_uid = old.uid);
	DELETE FROM person_search_entries WHERE source_uid = old.uid;
	INSERT INTO person_search_entries (source_uid, person_uid)
	SELECT new.uid, new.resource_uid WHERE new.resource_type = 'person_name';
	INSERT INTO person_search (rowid, terms)
	SELECT id, (
		WITH RECURSIVE positions(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM positions WHERE i < length(new.content) - 1)
		SELECT group_concat(bigram, ' ') FROM (SELECT substr(new.content, i, 2) AS bigram FROM positions ORDER BY i)
	)
	FROM person_search_entries WHERE source_uid = new.uid;
END;
--> statement-breakpoint
CREATE TRIGGER `translations_person_search_delete` AFTER DELETE ON `translations`
WHEN old.resource_type = 'person_name'
BEGIN
	DELETE FROM person_search WHERE rowid = (SELECT id FROM person_search_entries WHERE source_uid = old.uid);
	DELETE FROM person_search_entries WHERE source_uid = old.uid;
END;
--> statement-breakpoint
CREATE TRIGGER `translations_movie_search_insert` AFTER INSERT ON `translations`
WHEN new.resource_type = 'movie_title'
BEGIN
	INSERT INTO movie_search_entries (source_uid, movie_uid) VALUES (new.uid, new.resource_uid);
	INSERT INTO movie_search (rowid, terms)
	SELECT id, (
		WITH RECURSIVE positions(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM positions WHERE i < length(new.content) - 1)
		SELECT group_concat(bigram, ' ') FROM (SELECT substr(new.content, i, 2) AS bigram FROM positions ORDER BY i)
	)
	FROM movie_search_entries WHERE source_uid = new.uid;
END;
--> statement-breakpoint
CREATE TRIGGER `translations_movie_search_update` AFTER UPDATE OF resource_type, resource_uid, content ON `translations`
WHEN (old.resource_type = 'movie_title' OR new.resource_type = 'movie_title')
	AND (old.resource_type IS NOT new.resource_type OR old.resource_uid IS NOT new.resource_uid OR old.content IS NOT new.content)
BEGIN
	DELETE FROM movie_search WHERE rowid = (SELECT id FROM movie_search_entries WHERE source_uid = old.uid);
	DELETE FROM movie_search_entries WHERE source_uid = old.uid;
	INSERT INTO movie_search_entries (source_uid, movie_uid)
	SELECT new.uid, new.resource_uid WHERE new.resource_type = 'movie_title';
	INSERT INTO movie_search (rowid, terms)
	SELECT id, (
		WITH RECURSIVE positions(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM positions WHERE i < length(new.content) - 1)
		SELECT group_concat(bigram, ' ') FROM (SELECT substr(new.content, i, 2) AS bigram FROM positions ORDER BY i)
	)
	FROM movie_search_entries WHERE source_uid = new.uid;
END;
--> statement-breakpoint
CREATE TRIGGER `translations_movie_search_delete` AFTER DELETE ON `translations`
WHEN old.resource_type = 'movie_title'
BEGIN
	DELETE FROM movie_search WHERE rowid = (SELECT id FROM movie_search_entries WHERE source_uid = old.uid);
	DELETE FROM movie_search_entries WHERE source_uid = old.uid;
END;
