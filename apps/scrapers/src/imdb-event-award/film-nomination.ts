import {and, eq, isNull} from 'drizzle-orm';
import {nominations} from '@shine/database/schema/nominations';
import {type AwardFilm, type ImportContext} from './types';

export type FilmNominationState = {
  isWinner: number;
  specialMention: string | null;
};

export async function loadFilmNominations(
  context: ImportContext,
  ceremonyUid: string,
  categoryUid: string,
): Promise<Map<string, FilmNominationState>> {
  const rows = await context.database
    .select({
      movieUid: nominations.movieUid,
      isWinner: nominations.isWinner,
      specialMention: nominations.specialMention,
    })
    .from(nominations)
    .where(
      and(
        eq(nominations.ceremonyUid, ceremonyUid),
        eq(nominations.categoryUid, categoryUid),
        isNull(nominations.personUid),
      ),
    );

  return new Map(
    rows.map(row => [
      row.movieUid,
      {isWinner: row.isWinner, specialMention: row.specialMention},
    ]),
  );
}

export async function ensureFilmNomination(
  context: ImportContext,
  movieUid: string,
  ceremonyUid: string,
  categoryUid: string,
  film: AwardFilm,
  nominationsByMovieUid: Map<string, FilmNominationState>,
): Promise<void> {
  const {database, stats} = context;
  const existing = nominationsByMovieUid.get(movieUid);
  const winnerFlag = film.isWinner ? 1 : 0;

  if (existing === undefined) {
    await database
      .insert(nominations)
      .values({
        movieUid,
        ceremonyUid,
        categoryUid,
        isWinner: winnerFlag,
        specialMention: film.specialMention,
      })
      .onConflictDoNothing();
    nominationsByMovieUid.set(movieUid, {
      isWinner: winnerFlag,
      specialMention: film.specialMention ?? null, // eslint-disable-line unicorn/no-null -- DBのnullable列に合わせる
    });
    stats.nominationsCreated++;
    return;
  }

  const promoteWinner = film.isWinner && existing.isWinner === 0;
  const isUpdateMention =
    film.specialMention !== undefined &&
    film.specialMention !== existing.specialMention;

  if (!promoteWinner && !isUpdateMention) {
    return;
  }

  await database
    .update(nominations)
    .set({
      ...(promoteWinner && {isWinner: 1}),
      ...(isUpdateMention && {specialMention: film.specialMention}),
    })
    .where(
      and(
        eq(nominations.movieUid, movieUid),
        eq(nominations.ceremonyUid, ceremonyUid),
        eq(nominations.categoryUid, categoryUid),
        isNull(nominations.personUid),
      ),
    );

  nominationsByMovieUid.set(movieUid, {
    isWinner: promoteWinner ? 1 : existing.isWinner,
    specialMention: isUpdateMention
      ? (film.specialMention ?? null) // eslint-disable-line unicorn/no-null -- DBのnullable列に合わせる
      : existing.specialMention,
  });

  if (promoteWinner) {
    stats.winnersUpdated++;
  }
}
