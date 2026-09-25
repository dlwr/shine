import {and, eq, sql, type getDatabase} from '@shine/database';
import {movieSelections} from '@shine/database/schema/movie-selections';
import {getSelectionDate, type SelectionType} from './selection-dates';
import {pickNominatedMovieUid} from './selection-pick';

type Database = ReturnType<typeof getDatabase>;

export async function findSelectedMovieUid(
  database: Database,
  type: SelectionType,
  selectionDate: string,
): Promise<string | undefined> {
  const rows = await database
    .select({movieId: movieSelections.movieId})
    .from(movieSelections)
    .where(
      and(
        eq(movieSelections.selectionType, type),
        eq(movieSelections.selectionDate, selectionDate),
      ),
    )
    .limit(1);

  return rows[0]?.movieId;
}

export async function deleteSelection(
  database: Database,
  type: SelectionType,
  selectionDate: string,
): Promise<void> {
  await database
    .delete(movieSelections)
    .where(
      and(
        eq(movieSelections.selectionType, type),
        eq(movieSelections.selectionDate, selectionDate),
      ),
    );
}

export async function deleteSelectionsAfter(
  database: Database,
  type: SelectionType,
  selectionDate: string,
): Promise<number> {
  const deleted = await database
    .delete(movieSelections)
    .where(
      and(
        eq(movieSelections.selectionType, type),
        sql`${movieSelections.selectionDate} > ${selectionDate}`,
      ),
    )
    .returning({uid: movieSelections.uid});

  return deleted.length;
}

export async function pickSelectionMovieUid(
  database: Database,
  date: Date,
  type: SelectionType,
  seed: number | 'random',
  {
    persist,
    excludeMovieUids = [],
  }: {persist: boolean; excludeMovieUids?: string[]},
): Promise<string | undefined> {
  const selectedMovieUid = await pickNominatedMovieUid(
    database,
    seed,
    excludeMovieUids,
  );

  if (selectedMovieUid && persist) {
    await database
      .insert(movieSelections)
      .values({
        movieId: selectedMovieUid,
        selectionType: type,
        selectionDate: getSelectionDate(date, type),
        createdAt: Math.floor(Date.now() / 1000),
      })
      .onConflictDoNothing({
        target: [movieSelections.selectionType, movieSelections.selectionDate],
      });
  }

  return selectedMovieUid;
}
