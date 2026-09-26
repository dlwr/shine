import {
  and,
  eq,
  inArray,
  isNull,
  notInArray,
  sql,
  type getDatabase,
} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';

type Database = ReturnType<typeof getDatabase>;

export type RelatedMovie = {
  uid: string;
  title: string;
  year: number | undefined;
  posterUrl: string | undefined;
};

export async function findRelatedMovies(
  database: Database,
  movieId: string,
  locale: string,
  limit: number,
): Promise<RelatedMovie[] | undefined> {
  const target = await database
    .select({uid: movies.uid, year: movies.year})
    .from(movies)
    .where(and(eq(movies.uid, movieId), isNull(movies.deletedAt)))
    .limit(1);

  if (target.length === 0) {
    return undefined;
  }

  const targetYear = target[0].year ?? 0;

  const winners = await findCandidates(database, movieId, targetYear, {
    isWinner: 1,
    excludedUids: [],
    limit,
  });
  const nominees =
    winners.length < limit
      ? await findCandidates(database, movieId, targetYear, {
          isWinner: 0,
          excludedUids: winners.map(row => row.uid),
          limit: limit - winners.length,
        })
      : [];
  const candidates = [...winners, ...nominees];

  const candidateUids = candidates.map(row => row.uid);
  const rows =
    candidateUids.length > 0
      ? await database
          .select({
            uid: movies.uid,
            localeTitle: sql<string | undefined>`(
              SELECT content FROM translations
              WHERE resource_type = 'movie_title'
                AND resource_uid = movies.uid
                AND language_code = ${locale}
              LIMIT 1
            )`,
            defaultTitle: sql<string | undefined>`(
              SELECT content FROM translations
              WHERE resource_type = 'movie_title'
                AND resource_uid = movies.uid
                AND is_default = 1
              LIMIT 1
            )`,
            posterUrl: sql<string | undefined>`(
              SELECT url FROM poster_urls
              WHERE movie_uid = movies.uid
              ORDER BY is_primary DESC
              LIMIT 1
            )`,
          })
          .from(movies)
          .where(inArray(movies.uid, candidateUids))
      : [];

  const rowsByUid = new Map(rows.map(row => [row.uid, row]));
  const relatedMovies = candidates.map(candidate => {
    const row = rowsByUid.get(candidate.uid);
    return {
      uid: candidate.uid,
      title: row?.localeTitle ?? row?.defaultTitle ?? 'Unknown Title',
      year: candidate.year ?? undefined,
      posterUrl: row?.posterUrl ?? undefined,
    };
  });

  return relatedMovies;
}

async function findCandidates(
  database: Database,
  movieId: string,
  targetYear: number,
  options: {isWinner: number; excludedUids: string[]; limit: number},
): Promise<Array<{uid: string; year: number | null}>> {
  return database
    .select({uid: movies.uid, year: movies.year})
    .from(nominations)
    .innerJoin(movies, eq(nominations.movieUid, movies.uid))
    .where(
      and(
        sql`${nominations.categoryUid} IN (
          SELECT category_uid FROM nominations WHERE movie_uid = ${movieId}
        )`,
        eq(nominations.isWinner, options.isWinner),
        sql`${movies.uid} != ${movieId}`,
        sql`+${movies.deletedAt} IS NULL`,
        options.excludedUids.length > 0
          ? notInArray(movies.uid, options.excludedUids)
          : undefined,
      ),
    )
    .groupBy(movies.uid)
    .orderBy(
      sql`ABS(COALESCE(${movies.year}, 0) - ${targetYear}) ASC`,
      movies.uid,
    )
    .limit(options.limit);
}
