import {and, inArray, isNotNull} from 'drizzle-orm';
import {movies} from '@shine/database/schema/movies';
import {type DatabaseClient, type ExistingMovieRecord} from './types';

export async function loadExistingMovies(
  database: DatabaseClient,
  imdbIds: string[],
): Promise<{
  existingByImdbId: Map<string, ExistingMovieRecord>;
  softDeletedImdbIds: Set<string>;
}> {
  const existingMovies =
    imdbIds.length > 0
      ? await database
          .select({
            uid: movies.uid,
            imdbId: movies.imdbId,
            tmdbId: movies.tmdbId,
            deletedAt: movies.deletedAt,
          })
          .from(movies)
          .where(and(isNotNull(movies.imdbId), inArray(movies.imdbId, imdbIds)))
      : [];

  const existingByImdbId = new Map<string, ExistingMovieRecord>();
  const softDeletedImdbIds = new Set<string>();
  for (const movie of existingMovies) {
    if (!movie.imdbId) {
      continue;
    }

    if (movie.deletedAt !== null) {
      softDeletedImdbIds.add(movie.imdbId);
      continue;
    }

    if (typeof movie.tmdbId === 'number') {
      existingByImdbId.set(movie.imdbId, {
        uid: movie.uid,
        imdbId: movie.imdbId,
        tmdbId: movie.tmdbId,
      });
    } else {
      existingByImdbId.set(movie.imdbId, {
        uid: movie.uid,
        imdbId: movie.imdbId,
      });
    }
  }

  return {existingByImdbId, softDeletedImdbIds};
}
