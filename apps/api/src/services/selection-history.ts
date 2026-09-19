import {and, eq, isNull, sql, type getDatabase} from '@shine/database';
import {movieSelections} from '@shine/database/schema/movie-selections';
import {movies} from '@shine/database/schema/movies';
import type {SelectionType} from './selection-dates';

type Database = ReturnType<typeof getDatabase>;

export const HISTORY_MAX_LIMIT = 30;

export type SelectionHistoryItem = {
  uid: string;
  title: string;
  year: number | undefined;
  selectionDate: string;
  posterUrl: string | undefined;
  articleLinkCount: number;
};

export async function loadSelectionHistory(
  database: Database,
  type: SelectionType,
  today: string,
  locale: string,
): Promise<SelectionHistoryItem[]> {
  const rows = await database
    .select({
      uid: movies.uid,
      year: movies.year,
      selectionDate: movieSelections.selectionDate,
      localeTitle: sql<string | undefined>`(
        SELECT content FROM translations
        WHERE resource_type = 'movie_title'
          AND resource_uid = ${movies.uid}
          AND language_code = ${locale}
        LIMIT 1
      )`,
      defaultTitle: sql<string | undefined>`(
        SELECT content FROM translations
        WHERE resource_type = 'movie_title'
          AND resource_uid = ${movies.uid}
          AND is_default = 1
        LIMIT 1
      )`,
      posterUrl: sql<string | undefined>`(
        SELECT url FROM poster_urls
        WHERE poster_urls.movie_uid = movies.uid
        ORDER BY poster_urls.is_primary DESC, poster_urls.created_at ASC
        LIMIT 1
      )`,
      articleLinkCount: sql<number>`(
        SELECT COUNT(*) FROM article_links
        WHERE article_links.movie_uid = movies.uid
          AND article_links.is_spam = 0
          AND article_links.is_flagged = 0
      )`,
    })
    .from(movieSelections)
    .innerJoin(movies, eq(movieSelections.movieId, movies.uid))
    .where(
      and(
        eq(movieSelections.selectionType, type),
        sql`${movieSelections.selectionDate} <= ${today}`,
        isNull(movies.deletedAt),
      ),
    )
    .orderBy(sql`${movieSelections.selectionDate} DESC`)
    .limit(HISTORY_MAX_LIMIT);

  return rows.map(row => ({
    uid: row.uid,
    title: row.localeTitle ?? row.defaultTitle ?? 'Unknown Title',
    year: row.year ?? undefined,
    selectionDate: row.selectionDate,
    posterUrl: row.posterUrl ?? undefined,
    articleLinkCount: row.articleLinkCount,
  }));
}
