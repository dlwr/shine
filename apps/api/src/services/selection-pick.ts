import {
  and,
  eq,
  isNull,
  notInArray,
  sql,
  type getDatabase,
} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';

type Database = ReturnType<typeof getDatabase>;

export async function pickNominatedMovieUid(
  database: Database,
  seed: number | 'random',
  excludeMovieUids: string[] = [],
): Promise<string | undefined> {
  // Movies with more nominations have proportionally higher chance of being
  // selected。個人賞は日本の映画にだけ付くので、重み付けからは外す
  const whereClause = and(
    isNull(movies.deletedAt),
    isNull(nominations.personUid),
    excludeMovieUids.length > 0
      ? notInArray(nominations.movieUid, excludeMovieUids)
      : undefined,
  );

  const [countRow] = await database
    .select({total: sql<number>`count(*)`})
    .from(nominations)
    .innerJoin(movies, eq(movies.uid, nominations.movieUid))
    .where(whereClause);

  const total = Number(countRow?.total ?? 0);
  if (total === 0) {
    return undefined;
  }

  const selectedIndex =
    seed === 'random' ? Math.floor(Math.random() * total) : seed % total;

  const [selectedNomination] = await database
    .select({movieUid: nominations.movieUid})
    .from(nominations)
    .innerJoin(movies, eq(movies.uid, nominations.movieUid))
    .where(whereClause)
    .orderBy(nominations.movieUid, nominations.uid)
    .limit(1)
    .offset(selectedIndex);

  return selectedNomination?.movieUid;
}
