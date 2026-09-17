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
  }));
}
