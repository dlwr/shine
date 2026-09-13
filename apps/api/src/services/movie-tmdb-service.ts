import {and, eq, not} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {BaseService} from './base-service';
import {
  ConflictError,
  NotFoundError,
  TmdbConfigError,
  TmdbDataNotFoundError,
  TmdbSyncError,
  ValidationError,
} from './errors';
import {invalidateMovieCaches} from './movie-cache-invalidation';
import {syncTmdbData, type TmdbSyncResult} from './tmdb-sync';

type MediaType = 'movie' | 'tv';

export type UpdateTmdbIdInput = {
  tmdbId?: unknown;
  refreshData?: unknown;
  mediaType?: unknown;
};

export type AutoFetchTmdbResult = {
  tmdbIdSet: boolean;
  postersAdded: number;
  translationsAdded: number;
};

export class MovieTmdbService extends BaseService {
  async updateTmdbId(
    movieId: string,
    input: UpdateTmdbIdInput,
  ): Promise<{refreshResults: TmdbSyncResult | undefined}> {
    const {tmdbId, refreshData, mediaType: bodyMediaType} = input;

    if (
      tmdbId !== undefined &&
      (typeof tmdbId !== 'number' ||
        !Number.isSafeInteger(tmdbId) ||
        tmdbId <= 0)
    ) {
      throw new ValidationError('TMDb ID must be a positive integer');
    }

    const movieExists = await this.database
      .select({
        uid: movies.uid,
        imdbId: movies.imdbId,
        mediaType: movies.mediaType,
      })
      .from(movies)
      .where(eq(movies.uid, movieId))
      .limit(1);

    if (movieExists.length === 0) {
      throw new NotFoundError('Movie not found');
    }

    const updateMediaType: MediaType =
      bodyMediaType === 'tv'
        ? 'tv'
        : (movieExists[0].mediaType as MediaType) || 'movie';

    if (typeof tmdbId === 'number') {
      await this.assertTmdbIdUnused(
        movieId,
        tmdbId,
        updateMediaType,
        'TMDb ID is already used by another movie',
      );
    }

    await this.database
      .update(movies)
      .set({
        tmdbId: typeof tmdbId === 'number' ? tmdbId : undefined,
        mediaType: updateMediaType,
      })
      .where(eq(movies.uid, movieId));

    let refreshResults: TmdbSyncResult = {
      postersAdded: 0,
      translationsAdded: 0,
    };

    if (refreshData && typeof tmdbId === 'number' && this.env.TMDB_API_KEY) {
      try {
        refreshResults = await syncTmdbData(
          this.database,
          movieId,
          tmdbId,
          updateMediaType,
          this.env,
        );
      } catch (refreshError) {
        console.warn('Error during data refresh:', refreshError);
      }
    }

    await invalidateMovieCaches(this.env, movieId);

    return {refreshResults: refreshData ? refreshResults : undefined};
  }

  async autoFetchTmdb(movieId: string): Promise<AutoFetchTmdbResult> {
    const movie = await this.database
      .select({
        uid: movies.uid,
        imdbId: movies.imdbId,
        tmdbId: movies.tmdbId,
        originalLanguage: movies.originalLanguage,
        mediaType: movies.mediaType,
      })
      .from(movies)
      .where(eq(movies.uid, movieId))
      .limit(1);

    if (movie.length === 0) {
      throw new NotFoundError('Movie not found');
    }

    const {imdbId, tmdbId} = movie[0];
    if (!imdbId) {
      throw new ValidationError('Movie does not have an IMDb ID');
    }

    const tmdbApiKey = this.env.TMDB_API_KEY;
    if (!tmdbApiKey || tmdbApiKey === '') {
      throw new TmdbConfigError();
    }

    const fetchResults: AutoFetchTmdbResult = {
      tmdbIdSet: false,
      postersAdded: 0,
      translationsAdded: 0,
    };

    try {
      const {findTMDBByImdbId} =
        await import('@shine/scrapers/common/tmdb-utilities');

      let movieTmdbId: number | undefined = tmdbId ?? undefined;
      let detectedMediaType: MediaType =
        (movie[0].mediaType as MediaType) || 'movie';

      if (!movieTmdbId) {
        const findResult = await findTMDBByImdbId(imdbId, tmdbApiKey);

        if (!findResult) {
          throw new TmdbDataNotFoundError('TMDb映画が見つかりませんでした');
        }

        movieTmdbId = findResult.tmdbId;
        detectedMediaType = findResult.mediaType;

        await this.assertTmdbIdUnused(
          movieId,
          movieTmdbId,
          detectedMediaType,
          'このTMDb IDは既に他の映画で使用されています',
        );

        try {
          await this.database
            .update(movies)
            .set({
              tmdbId: movieTmdbId,
              mediaType: detectedMediaType,
            })
            .where(eq(movies.uid, movieId));
        } catch (databaseError) {
          console.error('Database update error:', {
            error: databaseError,
            movieId,
            tmdbId: movieTmdbId,
          });
          throw databaseError;
        }

        fetchResults.tmdbIdSet = true;
      }

      const syncResult = await syncTmdbData(
        this.database,
        movieId,
        movieTmdbId,
        detectedMediaType,
        this.env,
      );
      fetchResults.postersAdded = syncResult.postersAdded;
      fetchResults.translationsAdded = syncResult.translationsAdded;

      await invalidateMovieCaches(this.env, movieId);

      return fetchResults;
    } catch (fetchError) {
      if (
        fetchError instanceof NotFoundError ||
        fetchError instanceof ConflictError
      ) {
        throw fetchError;
      }

      throw new TmdbSyncError('TMDbデータの自動取得に失敗しました', {
        cause: fetchError,
      });
    }
  }

  async refreshTmdb(movieId: string): Promise<TmdbSyncResult> {
    const movie = await this.database
      .select({
        uid: movies.uid,
        tmdbId: movies.tmdbId,
        mediaType: movies.mediaType,
      })
      .from(movies)
      .where(eq(movies.uid, movieId))
      .limit(1);

    if (movie.length === 0) {
      throw new NotFoundError('Movie not found');
    }

    const {tmdbId} = movie[0];
    if (!tmdbId) {
      throw new ValidationError('Movie does not have a TMDb ID');
    }

    if (!this.env.TMDB_API_KEY) {
      throw new TmdbConfigError();
    }

    const refreshMediaType = (movie[0].mediaType as MediaType) || 'movie';

    try {
      const refreshResults = await syncTmdbData(
        this.database,
        movieId,
        tmdbId,
        refreshMediaType,
        this.env,
      );

      await invalidateMovieCaches(this.env, movieId);

      return refreshResults;
    } catch (refreshError) {
      throw new TmdbSyncError('Failed to refresh TMDb data', {
        cause: refreshError,
      });
    }
  }

  private async assertTmdbIdUnused(
    movieId: string,
    tmdbId: number,
    mediaType: MediaType,
    message: string,
  ): Promise<void> {
    const existingMovie = await this.database
      .select({uid: movies.uid})
      .from(movies)
      .where(
        and(
          eq(movies.tmdbId, tmdbId),
          eq(movies.mediaType, mediaType),
          not(eq(movies.uid, movieId)),
        ),
      )
      .limit(1);

    if (existingMovie.length > 0) {
      throw new ConflictError(message);
    }
  }
}
