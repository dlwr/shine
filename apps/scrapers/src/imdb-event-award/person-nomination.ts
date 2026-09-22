import {and, eq, isNotNull} from 'drizzle-orm';
import {nominations} from '@shine/database/schema/nominations';
import {matchPersonName} from '../common/japanese-name';
import {
  creditedPeople,
  resolveFromPersonOverride,
  resolveFromTmdbCredits,
} from './resolve-person';
import {type AwardFilm, type ImportContext} from './types';

export async function ensurePersonNominations(
  context: ImportContext,
  movieUid: string,
  ceremonyUid: string,
  categoryUid: string,
  film: AwardFilm,
): Promise<void> {
  const {database, config, stats} = context;
  const role = config.personRole ?? 'actor';
  const candidates = await creditedPeople(database, movieUid, role);

  const existing = await database
    .select({personUid: nominations.personUid, isWinner: nominations.isWinner})
    .from(nominations)
    .where(
      and(
        eq(nominations.movieUid, movieUid),
        eq(nominations.ceremonyUid, ceremonyUid),
        eq(nominations.categoryUid, categoryUid),
        isNotNull(nominations.personUid),
      ),
    );
  const winnerByPersonUid = new Map(
    existing.map(row => [row.personUid, row.isWinner]),
  );

  const nominees = film.people ?? [];
  for (const person of nominees) {
    const personUid =
      matchPersonName(person.name, candidates) ??
      (await resolveFromTmdbCredits(context, movieUid, person.name, role)) ??
      (await resolveFromPersonOverride(
        context,
        movieUid,
        `${film.imdbId}:${person.name}`,
        role,
      ));
    if (!personUid) {
      console.log(
        `  Unresolved person: ${person.name} (${film.title ?? ''} ${film.imdbId})`,
      );
      stats.peopleUnresolved++;
      continue;
    }

    const winnerFlag = person.isWinner ? 1 : 0;
    const current = winnerByPersonUid.get(personUid);

    if (current === undefined) {
      await database
        .insert(nominations)
        .values({
          movieUid,
          ceremonyUid,
          categoryUid,
          personUid,
          isWinner: winnerFlag,
        })
        .onConflictDoNothing();
      winnerByPersonUid.set(personUid, winnerFlag);
      stats.nominationsCreated++;
      continue;
    }

    if (!(winnerFlag === 1 && current === 0)) {
      continue;
    }

    await database
      .update(nominations)
      .set({isWinner: 1})
      .where(
        and(
          eq(nominations.movieUid, movieUid),
          eq(nominations.ceremonyUid, ceremonyUid),
          eq(nominations.categoryUid, categoryUid),
          eq(nominations.personUid, personUid),
        ),
      );
    winnerByPersonUid.set(personUid, 1);
    stats.winnersUpdated++;
  }
}
