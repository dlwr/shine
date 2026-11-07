import {
  and,
  eq,
  gt,
  notInArray,
  sql,
  type SQL,
  type getDatabase,
} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';

type Database = ReturnType<typeof getDatabase>;

function seedPivot(seed: number | 'random'): string {
  const value =
    seed === 'random'
      ? Math.floor(Math.random() * 0x1_00_00_00_00)
      : seed >>> 0;
  return value.toString(16).padStart(8, '0');
}

export async function pickNominatedMovieUid(
  database: Database,
  seed: number | 'random',
  excludeMovieUids: string[] = [],
): Promise<string | undefined> {
  // ノミネーションの uid（UUID v4）の並びで種の位置から次の 1 件を引くので、ノミネーションの多い映画ほど当たりやすい。個人賞は日本の映画にだけ付くので、重み付けからは外す
  const pickFrom = async (pivot: SQL | undefined) => {
    const [row] = await database
      .select({movieUid: nominations.movieUid})
      .from(nominations)
      .innerJoin(movies, eq(movies.uid, nominations.movieUid))
      .where(
        and(
          pivot,
          sql`+${movies.deletedAt} IS NULL`,
          sql`+${nominations.personUid} IS NULL`,
          excludeMovieUids.length > 0
            ? notInArray(nominations.movieUid, excludeMovieUids)
            : undefined,
        ),
      )
      .orderBy(nominations.uid)
      .limit(1);
    return row?.movieUid;
  };

  return (
    (await pickFrom(gt(nominations.uid, seedPivot(seed)))) ??
    (await pickFrom(undefined))
  );
}
