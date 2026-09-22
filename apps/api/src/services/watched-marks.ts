import {and, eq, sql, type getDatabase} from '@shine/database';
import {watchedMarks} from '@shine/database/schema/watched-marks';

type Database = ReturnType<typeof getDatabase>;

export async function countWatchedMarks(
  database: Database,
  movieUid: string,
): Promise<number> {
  const [row] = await database
    .select({count: sql<number>`count(*)`})
    .from(watchedMarks)
    .where(
      and(eq(watchedMarks.movieUid, movieUid), eq(watchedMarks.isOwner, false)),
    );
  return row?.count ?? 0;
}
