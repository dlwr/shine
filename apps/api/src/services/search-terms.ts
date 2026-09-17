import {sql} from '@shine/database';

export function bigramPhrase(query: string): string | undefined {
  const characters = [...query];
  if (characters.length < 2) {
    return undefined;
  }

  const bigrams = characters
    .slice(1)
    .map((character, index) => `${characters[index]}${character}`);
  return `"${bigrams.join(' ').replaceAll('"', '""')}"`;
}

export function movieUidsMatchingTitle(query: string) {
  const phrase = bigramPhrase(query);
  if (phrase) {
    return sql`
			SELECT movie_uid FROM movie_search_entries
			WHERE id IN (
			  SELECT rowid FROM movie_search WHERE movie_search MATCH ${phrase}
			)
		`;
  }

  return sql`
		SELECT resource_uid FROM translations
		WHERE resource_type = 'movie_title'
		  AND content LIKE ${likePattern(query)} ESCAPE '\\'
	`;
}

export function personUidsMatchingName(query: string) {
  const phrase = bigramPhrase(query);
  if (phrase) {
    return sql`
			SELECT person_uid FROM person_search_entries
			WHERE id IN (
			  SELECT rowid FROM person_search WHERE person_search MATCH ${phrase}
			)
		`;
  }

  const pattern = likePattern(query);
  return sql`
		SELECT uid FROM people
		WHERE name LIKE ${pattern} ESCAPE '\\'
		UNION
		SELECT resource_uid FROM translations
		WHERE resource_type = 'person_name'
		  AND content LIKE ${pattern} ESCAPE '\\'
	`;
}

function likePattern(query: string): string {
  return `%${query.replaceAll(/[\\%_]/g, String.raw`\$&`)}%`;
}
