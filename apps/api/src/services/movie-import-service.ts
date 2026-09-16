import {and, eq, isNull, not} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {
  fetchTMDBMovieImages,
  type TMDBMovieData,
} from '@shine/scrapers/common/tmdb-client';
import {BaseService} from './base-service';
import {
  ConflictError,
  NotFoundError,
  TmdbDataNotFoundError,
  ValidationError,
} from './errors';
import {
  addPosterFromTmdb,
  addTranslationsFromTmdb,
  fetchTmdbMovieDataByImdbId,
} from './movie-import/tmdb-movie-data';
import type {UpdateIMDBIdOptions} from '@shine/types';

export class MovieImportService extends BaseService {
  async createMovieFromImdbId(
    imdbId: string,
    options: {fetchTMDBData?: boolean} = {},
  ): Promise<{
    movie: typeof movies.$inferSelect;
    tmdbId?: number;
    postersAdded: number;
    translationsAdded: number;
  }> {
    const normalizedImdbId = imdbId.trim();

    if (!normalizedImdbId) {
      throw new ValidationError('IMDb ID is required');
    }

    if (!/^tt\d+$/.test(normalizedImdbId)) {
      throw new ValidationError("IMDB ID must be in format 'tt1234567'");
    }

    const existingMovie = await this.database
      .select({uid: movies.uid})
      .from(movies)
      .where(eq(movies.imdbId, normalizedImdbId))
      .limit(1);

    if (existingMovie.length > 0) {
      throw new ConflictError('IMDB ID is already used by another movie');
    }

    const {fetchTMDBData = true} = options;

    let tmdbMovieId: number | undefined;
    let tmdbMovieData: TMDBMovieData | undefined;
    let detectedMediaType: 'movie' | 'tv' = 'movie';

    if (fetchTMDBData) {
      const tmdbData = await fetchTmdbMovieDataByImdbId(
        this.env,
        normalizedImdbId,
      );

      if (!tmdbData) {
        throw new TmdbDataNotFoundError(
          'Could not find TMDB data for that IMDb ID',
        );
      }

      tmdbMovieId = tmdbData.tmdbId;
      tmdbMovieData = tmdbData.movie;
      detectedMediaType = tmdbData.mediaType;

      if (tmdbMovieId !== undefined) {
        const existingByTmdb = await this.database
          .select({uid: movies.uid})
          .from(movies)
          .where(
            and(
              eq(movies.tmdbId, tmdbMovieId),
              eq(movies.mediaType, detectedMediaType),
            ),
          )
          .limit(1);

        if (existingByTmdb.length > 0) {
          throw new ConflictError('TMDB ID is already used by another movie');
        }
      }
    }

    let releaseYear: number | undefined;
    if (tmdbMovieData?.release_date) {
      const parsedYear = Number(tmdbMovieData.release_date.slice(0, 4));
      if (!Number.isNaN(parsedYear)) {
        releaseYear = parsedYear;
      }
    }

    const movieValues: typeof movies.$inferInsert = {
      imdbId: normalizedImdbId,
    };

    if (tmdbMovieData?.original_language) {
      movieValues.originalLanguage = tmdbMovieData.original_language;
    }

    if (releaseYear !== undefined) {
      movieValues.year = releaseYear;
    }

    if (tmdbMovieId !== undefined) {
      movieValues.tmdbId = tmdbMovieId;
    }

    movieValues.mediaType = detectedMediaType;

    const [newMovie] = await this.database
      .insert(movies)
      .values(movieValues)
      .returning();

    if (!newMovie) {
      throw new Error('Failed to create movie');
    }

    let postersAdded = 0;
    let translationsAdded = 0;

    if (fetchTMDBData && this.env.TMDB_API_KEY) {
      try {
        const {savePosterUrls} =
          await import('@shine/scrapers/common/tmdb-utilities');

        const imagesResult = await fetchTMDBMovieImages(
          normalizedImdbId,
          this.env.TMDB_API_KEY,
        );

        if (imagesResult?.images?.posters?.length) {
          const saved = await savePosterUrls(
            newMovie.uid,
            imagesResult.images.posters,
            this.env,
          );
          postersAdded += saved;
        }

        if (!tmdbMovieId && imagesResult?.tmdbId) {
          tmdbMovieId = imagesResult.tmdbId;
          await this.database
            .update(movies)
            .set({
              tmdbId: tmdbMovieId,
            })
            .where(eq(movies.uid, newMovie.uid));
        }
      } catch (error) {
        console.error('Failed to save TMDB posters:', error);
      }
    }

    if (tmdbMovieData) {
      if (postersAdded === 0) {
        postersAdded = await addPosterFromTmdb(
          this.database,
          newMovie.uid,
          tmdbMovieData,
        );
      }

      translationsAdded = await addTranslationsFromTmdb(
        this.database,
        newMovie.uid,
        tmdbMovieData,
      );
    }

    const tmdbIdValue = newMovie.tmdbId ?? tmdbMovieId;
    const yearValue = newMovie.year ?? releaseYear;

    const movieDetails = {
      ...newMovie,
      imdbId: newMovie.imdbId ?? normalizedImdbId,
    };

    if (tmdbIdValue === undefined) {
      // Keep existing value from database when new data is unavailable
    } else {
      movieDetails.tmdbId = tmdbIdValue;
    }

    if (yearValue === undefined) {
      // Preserve existing year if we cannot determine a better value
    } else {
      movieDetails.year = yearValue;
    }

    return {
      movie: movieDetails,
      tmdbId: tmdbMovieId,
      postersAdded,
      translationsAdded,
    };
  }

  async updateIMDbId(
    movieId: string,
    options: UpdateIMDBIdOptions,
  ): Promise<{
    tmdbId?: number;
    postersAdded: number;
    translationsAdded: number;
  }> {
    const {imdbId, fetchTMDBData = false} = options;

    // Validate IMDb ID format (can be empty for removal)
    if (imdbId && !/^tt\d+$/.test(imdbId)) {
      throw new ValidationError("IMDB ID must be in format 'tt1234567'");
    }

    // Check if movie exists
    const movieExists = await this.database
      .select({uid: movies.uid})
      .from(movies)
      .where(and(eq(movies.uid, movieId), isNull(movies.deletedAt)))
      .limit(1);

    if (movieExists.length === 0) {
      throw new NotFoundError('Movie not found');
    }

    // Check for duplicate IMDb ID if setting one
    if (imdbId) {
      const existingMovie = await this.database
        .select({uid: movies.uid})
        .from(movies)
        .where(and(eq(movies.imdbId, imdbId), not(eq(movies.uid, movieId))))
        .limit(1);

      if (existingMovie.length > 0) {
        throw new ConflictError('IMDB ID is already used by another movie');
      }
    }

    let tmdbId: number | undefined;
    let postersAdded = 0;
    let translationsAdded = 0;
    let detectedMediaType: 'movie' | 'tv' | undefined;

    if (fetchTMDBData) {
      try {
        const tmdbData = await fetchTmdbMovieDataByImdbId(this.env, imdbId);
        if (tmdbData) {
          tmdbId = tmdbData.tmdbId;
          detectedMediaType = tmdbData.mediaType;
          postersAdded = await addPosterFromTmdb(
            this.database,
            movieId,
            tmdbData.movie,
          );
          translationsAdded = await addTranslationsFromTmdb(
            this.database,
            movieId,
            tmdbData.movie,
          );

          // Update originalLanguage if available
          if (tmdbData.movie.original_language) {
            await this.database
              .update(movies)
              .set({
                originalLanguage: tmdbData.movie.original_language,
              })
              .where(eq(movies.uid, movieId));
          }
        }
      } catch (error) {
        console.error('Failed to fetch TMDB data:', error);
      }
    }

    await this.database
      .update(movies)
      .set({
        imdbId,
        ...(tmdbId && {tmdbId}),
        ...(detectedMediaType && {mediaType: detectedMediaType}),
      })
      .where(eq(movies.uid, movieId));

    return {tmdbId, postersAdded, translationsAdded};
  }
}
