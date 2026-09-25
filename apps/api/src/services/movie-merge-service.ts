import {
  and,
  eq,
  isNull,
  not,
  runBatch,
  type getDatabase,
  type WriteStatement,
} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {BaseService} from './base-service';
import {NotFoundError, ValidationError} from './errors';
import {
  deleteMovieDependents,
  reassignMovieDependents,
} from './movie-dependents';
import type {MergeMoviesOptions} from '../types/movies';

type Database = ReturnType<typeof getDatabase>;
type MovieRow = typeof movies.$inferSelect;

export class MovieMergeService extends BaseService {
  async deleteMovie(movieId: string): Promise<void> {
    await runBatch(this.database, [
      ...deleteMovieDependents(this.database, movieId),
      this.database.delete(movies).where(eq(movies.uid, movieId)),
    ]);
  }

  async mergeMovies(options: MergeMoviesOptions): Promise<void> {
    const {
      sourceMovieId,
      targetMovieId,
      preserveTranslations,
      preservePosters,
    } = options;

    if (sourceMovieId === targetMovieId) {
      throw new ValidationError('Cannot merge a movie with itself');
    }

    const [sourceMovie] = await this.database
      .select()
      .from(movies)
      .where(and(eq(movies.uid, sourceMovieId), isNull(movies.deletedAt)))
      .limit(1);

    const [targetMovie] = await this.database
      .select()
      .from(movies)
      .where(and(eq(movies.uid, targetMovieId), isNull(movies.deletedAt)))
      .limit(1);

    if (!sourceMovie) {
      throw new NotFoundError('Source movie not found');
    }

    if (!targetMovie) {
      throw new NotFoundError('Target movie not found');
    }

    await runBatch(this.database, [
      ...(await reassignMovieDependents(
        this.database,
        sourceMovieId,
        targetMovieId,
        {preserveTranslations, preservePosters},
      )),
      this.database.delete(movies).where(eq(movies.uid, sourceMovieId)),
      ...(await carryOverExternalIds(this.database, sourceMovie, targetMovie)),
    ]);
  }
}

async function carryOverExternalIds(
  database: Database,
  sourceMovie: MovieRow,
  targetMovie: MovieRow,
): Promise<WriteStatement[]> {
  const updateData: Partial<typeof movies.$inferInsert> = {};

  if (!targetMovie.imdbId && sourceMovie.imdbId) {
    const existingImdbMovie = await database
      .select({uid: movies.uid})
      .from(movies)
      .where(
        and(
          eq(movies.imdbId, sourceMovie.imdbId),
          not(eq(movies.uid, targetMovie.uid)),
          not(eq(movies.uid, sourceMovie.uid)),
        ),
      )
      .limit(1);

    if (existingImdbMovie.length === 0) {
      updateData.imdbId = sourceMovie.imdbId;
    }
  }

  if (!targetMovie.tmdbId && sourceMovie.tmdbId) {
    const existingTmdbMovie = await database
      .select({uid: movies.uid})
      .from(movies)
      .where(
        and(
          eq(movies.tmdbId, sourceMovie.tmdbId),
          eq(movies.mediaType, sourceMovie.mediaType),
          not(eq(movies.uid, targetMovie.uid)),
          not(eq(movies.uid, sourceMovie.uid)),
        ),
      )
      .limit(1);

    if (existingTmdbMovie.length === 0) {
      updateData.tmdbId = sourceMovie.tmdbId;
      updateData.mediaType = sourceMovie.mediaType;
    }
  }

  return Object.keys(updateData).length > 0
    ? [
        database
          .update(movies)
          .set(updateData)
          .where(eq(movies.uid, targetMovie.uid)),
      ]
    : [];
}
