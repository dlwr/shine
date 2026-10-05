import {sql} from '@shine/database';

export function localizedPosterUrl(locale: string) {
  const languageCode = locale.split('-', 1)[0];
  return sql<string | null>`(
    SELECT url FROM poster_urls
    WHERE poster_urls.movie_uid = movies.uid
    ORDER BY (poster_urls.language_code IS ${languageCode}) DESC,
      poster_urls.is_primary DESC,
      (poster_urls.language_code IS NULL) DESC,
      poster_urls.created_at ASC
    LIMIT 1
  )`;
}
