import {and, eq, isNull} from 'drizzle-orm';
import {type getDatabase} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {translations} from '@shine/database/schema/translations';

type DatabaseClient = ReturnType<typeof getDatabase>;

type ExistingMovie =
  | {status: 'active'; uid: string; imdbId: string | null}
  | {status: 'soft-deleted'}
  | {status: 'missing'};

export async function findExistingMovie(
  database: DatabaseClient,
  title: string,
  imdbId: string | undefined,
): Promise<ExistingMovie> {
  if (imdbId) {
    const [movieWithImdbId] = await database
      .select({
        uid: movies.uid,
        imdbId: movies.imdbId,
        deletedAt: movies.deletedAt,
      })
      .from(movies)
      .where(eq(movies.imdbId, imdbId))
      .limit(1);

    if (movieWithImdbId) {
      return movieWithImdbId.deletedAt === null
        ? {
            status: 'active',
            uid: movieWithImdbId.uid,
            imdbId: movieWithImdbId.imdbId,
          }
        : {status: 'soft-deleted'};
    }
  }

  const [movieWithTitle] = await database
    .select({uid: movies.uid, imdbId: movies.imdbId})
    .from(movies)
    .innerJoin(
      translations,
      and(
        eq(translations.resourceUid, movies.uid),
        eq(translations.resourceType, 'movie_title'),
        eq(translations.languageCode, 'en'),
      ),
    )
    .where(and(eq(translations.content, title), isNull(movies.deletedAt)))
    .limit(1);

  return movieWithTitle
    ? {status: 'active', uid: movieWithTitle.uid, imdbId: movieWithTitle.imdbId}
    : {status: 'missing'};
}
