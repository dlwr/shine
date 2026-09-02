import {and, eq, isNull, sql} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import type {getDatabase} from '@shine/database';
import type {SearchOptions} from '@shine/types';

type Database = ReturnType<typeof getDatabase>;

function buildConditions({query, year, language, hasAwards}: SearchOptions) {
  const conditions = [isNull(movies.deletedAt)];

  if (query) {
    conditions.push(sql`
				(
				  EXISTS (
				    SELECT 1
				    FROM translations
				    WHERE translations.resource_uid = movies.uid
				      AND translations.resource_type = 'movie_title'
				      AND translations.content LIKE ${`%${query}%`}
				  )
				  OR movies.uid IN (
				    SELECT movie_credits.movie_uid
				    FROM movie_credits
				    WHERE movie_credits.person_uid IN (
				      SELECT people.uid
				      FROM people
				      WHERE people.name LIKE ${`%${query}%`}
				      UNION
				      SELECT translations.resource_uid
				      FROM translations
				      WHERE translations.resource_type = 'person_name'
				        AND translations.content LIKE ${`%${query}%`}
				    )
				  )
				)
			`);
  }

  if (year && !Number.isNaN(Number(year))) {
    conditions.push(eq(movies.year, Number(year)));
  }

  if (language) {
    conditions.push(eq(movies.originalLanguage, language));
  }

  if (hasAwards === true) {
    conditions.push(sql`
				EXISTS (
				  SELECT 1
				  FROM nominations
				  WHERE nominations.movie_uid = movies.uid
				)
			`);
  } else if (hasAwards === false) {
    conditions.push(sql`
				NOT EXISTS (
				  SELECT 1
				  FROM nominations
				  WHERE nominations.movie_uid = movies.uid
				)
			`);
  }

  return conditions;
}

export function buildMovieSearchQueries(
  database: Database,
  options: SearchOptions,
) {
  const {page, limit} = options;
  const conditions = buildConditions(options);

  const results = database
    .select({
      uid: movies.uid,
      year: movies.year,
      originalLanguage: movies.originalLanguage,
      imdbId: movies.imdbId,
      title: sql<string | null>`
				(
				  SELECT content
				  FROM translations
				  WHERE translations.resource_uid = movies.uid
				    AND translations.resource_type = 'movie_title'
				  ORDER BY (translations.language_code = 'ja') DESC,
				    translations.is_default DESC,
				    (translations.language_code = 'en') DESC
				  LIMIT 1
				)
			`.as('title'),
      hasNominations: sql`
				(
				  SELECT COUNT(*) > 0
				  FROM nominations
				  WHERE nominations.movie_uid = movies.uid
				)
			`.as('hasNominations'),
    })
    .from(movies)
    .where(and(...conditions))
    .orderBy(movies.year, movies.uid)
    .limit(limit)
    .offset((page - 1) * limit);

  const count = database
    .select({count: sql`COUNT(*)`.as('count')})
    .from(movies)
    .where(and(...conditions));

  return {results, count};
}
