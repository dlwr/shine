import {sql} from '@shine/database';

export function movieTitleColumns() {
  return {
    jaTitle: sql<string | null>`(
      SELECT content FROM translations
      WHERE translations.resource_uid = movies.uid
        AND translations.resource_type = 'movie_title'
        AND translations.language_code = 'ja'
      LIMIT 1
    )`.as('jaTitle'),
    defaultTitle: sql<string | null>`(
      SELECT content FROM translations
      WHERE translations.resource_uid = movies.uid
        AND translations.resource_type = 'movie_title'
      ORDER BY translations.is_default DESC
      LIMIT 1
    )`.as('defaultTitle'),
  };
}

export function localizedMovieTitle(locale: string) {
  return sql<string | null>`(
    SELECT content FROM translations
    WHERE translations.resource_uid = movies.uid
      AND translations.resource_type = 'movie_title'
    ORDER BY (translations.language_code = ${locale}) DESC,
      translations.is_default DESC,
      (translations.language_code = 'en') DESC
    LIMIT 1
  )`.as('title');
}
