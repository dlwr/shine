import {and, eq, isNull, not} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {BaseService} from './base-service';
import {NotFoundError, ValidationError} from './errors';
import {
  deleteMovieDependents,
  type MovieDependentsExecutor,
  reassignMovieDependents,
} from './movie-dependents';
import type {MergeMoviesOptions} from '@shine/types';

type MovieRow = typeof movies.$inferSelect;

export class MovieMergeService extends BaseService {
  async deleteMovie(movieId: string): Promise<void> {
    await this.database.transaction(async trx => {
      await deleteMovieDependents(trx, movieId);
      await trx.delete(movies).where(eq(movies.uid, movieId));
    });
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

    await this.database.transaction(async trx => {
      await reassignMovieDependents(trx, sourceMovieId, targetMovieId, {
        preserveTranslations,
        preservePosters,
      });
      await trx.delete(movies).where(eq(movies.uid, sourceMovieId));
      await carryOverExternalIds(trx, sourceMovie, targetMovie);
    });
  }
}

async function carryOverExternalIds(
  trx: MovieDependentsExecutor,
  sourceMovie: MovieRow,
  targetMovie: MovieRow,
): Promise<void> {
  const updateData: Partial<typeof movies.$inferInsert> = {};

  if (!targetMovie.imdbId && sourceMovie.imdbId) {
    const existingImdbMovie = await trx
      .select({uid: movies.uid})
      .from(movies)
      .where(
        and(
          eq(movies.imdbId, sourceMovie.imdbId),
          not(eq(movies.uid, targetMovie.uid)),
        ),
      )
      .limit(1);

    if (existingImdbMovie.length === 0) {
      updateData.imdbId = sourceMovie.imdbId;
    }
  }

  if (!targetMovie.tmdbId && sourceMovie.tmdbId) {
    const existingTmdbMovie = await trx
      .select({uid: movies.uid})
      .from(movies)
      .where(
        and(
          eq(movies.tmdbId, sourceMovie.tmdbId),
          eq(movies.mediaType, sourceMovie.mediaType),
          not(eq(movies.uid, targetMovie.uid)),
        ),
      )
      .limit(1);

    if (existingTmdbMovie.length === 0) {
      updateData.tmdbId = sourceMovie.tmdbId;
      updateData.mediaType = sourceMovie.mediaType;
    }
  }

  if (Object.keys(updateData).length > 0) {
    await trx
      .update(movies)
      .set(updateData)
      .where(eq(movies.uid, targetMovie.uid));
  }
}
