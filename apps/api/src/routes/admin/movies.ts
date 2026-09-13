import {and, eq, getDatabase, not, type Environment} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {Hono} from 'hono';
import {authMiddleware} from '../../auth';
import {sanitizeText} from '../../middleware/sanitizer';
import {
  AdminMoviesService,
  ExternalIdSearchService,
  MovieImportService,
  MovieMergeService,
  SelectionsService,
} from '../../services';
import {
  ConflictError,
  NotFoundError,
  TmdbConfigError,
  ValidationError,
} from '../../services/errors';
import {
  invalidateMovieCaches,
  invalidateMovieDetailsCache,
} from '../../services/movie-cache-invalidation';
import {syncTmdbData, type TmdbSyncResult} from '../../services/tmdb-sync';
import {parsePagination} from '../../utils/pagination';

export const adminMoviesRoutes = new Hono<{Bindings: Environment}>();

// Get movie details for admin with all translations, posters, and nominations
adminMoviesRoutes.get('/movies/:id', authMiddleware, async c => {
  try {
    const movieId = c.req.param('id');
    if (!movieId) {
      return c.json({error: 'Missing id parameter'}, 400);
    }

    const movieDetails = await new AdminMoviesService(c.env).getMovieForAdmin(
      movieId,
    );

    return c.json(movieDetails);
  } catch (error) {
    console.error('Error fetching movie details for admin:', error);

    if (error instanceof NotFoundError) {
      return c.json({error: error.message}, 404);
    }

    return c.json({error: 'Internal server error'}, 500);
  }
});

adminMoviesRoutes.get(
  '/movies/:id/external-id-search',
  authMiddleware,
  async c => {
    try {
      const movieId = c.req.param('id');
      if (!movieId) {
        return c.json({error: 'Missing id parameter'}, 400);
      }

      const rawQuery = c.req.query('query');
      const rawLanguage = c.req.query('language');
      const rawYear = c.req.query('year');
      const rawLimit = c.req.query('limit');

      const query = rawQuery ? sanitizeText(rawQuery) : undefined;

      const language = (() => {
        if (!rawLanguage) {
          return;
        }

        const sanitized = sanitizeText(rawLanguage);

        if (/^ja/i.test(sanitized)) {
          return 'ja-JP';
        }

        if (/^en/i.test(sanitized)) {
          return 'en-US';
        }

        return;
      })();

      const year = rawYear ? Number(rawYear) : undefined;
      const limit = rawLimit ? Number(rawLimit) : undefined;

      if (year !== undefined && Number.isNaN(year)) {
        return c.json({error: 'Invalid year parameter'}, 400);
      }

      if (limit !== undefined && (Number.isNaN(limit) || limit < 1)) {
        return c.json({error: 'Invalid limit parameter'}, 400);
      }

      const result = await new ExternalIdSearchService(
        c.env,
      ).searchExternalMovieIds(movieId, {
        query,
        language,
        year,
        limit,
      });

      return c.json(result);
    } catch (error) {
      console.error('Error searching external IDs:', error);

      if (error instanceof NotFoundError) {
        return c.json({error: error.message}, 404);
      }

      if (error instanceof ValidationError) {
        return c.json({error: error.message}, 400);
      }

      if (error instanceof TmdbConfigError) {
        return c.json({error: 'TMDb API key is not configured'}, 503);
      }

      return c.json({error: 'Internal server error'}, 500);
    }
  },
);

// Get all movies for admin
adminMoviesRoutes.get('/movies', authMiddleware, async c => {
  try {
    const {page, limit} = parsePagination(c, {defaultLimit: 50});
    const rawSearch = c.req.query('search');
    const search = rawSearch ? sanitizeText(rawSearch) : undefined;

    const result = await new AdminMoviesService(c.env).getMovies({
      page,
      limit,
      search,
    });

    return c.json({
      movies: result.movies.map(movie => ({
        uid: movie.uid,
        year: movie.year,
        originalLanguage: movie.originalLanguage,
        imdbId: movie.imdbId,
        title: movie.title || 'Untitled',
        posterUrl: movie.posterUrl,
        imdbUrl: movie.imdbId
          ? `https://www.imdb.com/title/${movie.imdbId}/`
          : undefined,
      })),
      pagination: {
        page: result.pagination.currentPage,
        limit,
        totalCount: result.pagination.totalCount,
        totalPages: result.pagination.totalPages,
      },
    });
  } catch (error) {
    console.error('Error fetching movies list:', error);
    return c.json({error: 'Internal server error'}, 500);
  }
});

adminMoviesRoutes.post('/movies', authMiddleware, async c => {
  try {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({error: 'Invalid request body'}, 400);
    }

    const {imdbId, refreshData = true} = (body ?? {}) as {
      imdbId?: string;
      refreshData?: boolean;
    };

    if (!imdbId || typeof imdbId !== 'string') {
      return c.json({error: 'IMDb ID is required'}, 400);
    }

    const sanitizedImdbId = sanitizeText(imdbId);

    const result = await new MovieImportService(c.env).createMovieFromImdbId(
      sanitizedImdbId,
      {
        fetchTMDBData: refreshData !== false,
      },
    );

    return c.json(
      {
        success: true,
        movie: {
          uid: result.movie.uid,
          imdbId: result.movie.imdbId ?? undefined,
          tmdbId: result.movie.tmdbId ?? undefined,
          year: result.movie.year ?? undefined,
          originalLanguage: result.movie.originalLanguage,
        },
        imports: {
          translationsAdded: result.translationsAdded,
          postersAdded: result.postersAdded,
        },
      },
      201,
    );
  } catch (error) {
    console.error('Error creating movie:', error);

    if (error instanceof ValidationError) {
      return c.json({error: error.message}, 400);
    }

    if (error instanceof ConflictError) {
      return c.json({error: error.message}, 409);
    }

    if (error instanceof NotFoundError) {
      return c.json({error: error.message}, 404);
    }

    return c.json({error: 'Internal server error'}, 500);
  }
});

// Delete movie
adminMoviesRoutes.delete('/movies/:id', authMiddleware, async c => {
  try {
    const movieId = c.req.param('id');
    if (!movieId) {
      return c.json({error: 'Missing id parameter'}, 400);
    }

    await new SelectionsService(c.env).purgeSelectionCachesForMovie(movieId);
    await new MovieMergeService(c.env).deleteMovie(movieId);
    await invalidateMovieDetailsCache(c.env, movieId);

    return c.json({success: true});
  } catch (error) {
    console.error('Error deleting movie:', error);
    return c.json({error: 'Internal server error'}, 500);
  }
});
// Update movie basic info (year, original language)
adminMoviesRoutes.put('/movies/:id', authMiddleware, async c => {
  try {
    const database = getDatabase(c.env);
    const movieId = c.req.param('id');
    if (!movieId) {
      return c.json({error: 'Missing id parameter'}, 400);
    }

    const {year, originalLanguage, mediaType} = await c.req.json();

    // Check if movie exists
    const movieExists = await database
      .select({uid: movies.uid})
      .from(movies)
      .where(eq(movies.uid, movieId))
      .limit(1);

    if (movieExists.length === 0) {
      return c.json({error: 'Movie not found'}, 404);
    }

    const updateData: Partial<typeof movies.$inferInsert> = {};

    // Validate year if provided
    if (year !== undefined) {
      if (
        typeof year !== 'number' ||
        !Number.isSafeInteger(year) ||
        year < 1888 ||
        year > 2100
      ) {
        return c.json(
          {error: 'Year must be a valid integer between 1888 and 2100'},
          400,
        );
      }

      updateData.year = year;
    }

    // Validate original language if provided
    if (originalLanguage !== undefined) {
      if (originalLanguage && typeof originalLanguage !== 'string') {
        return c.json({error: 'Original language must be a string'}, 400);
      }

      if (originalLanguage && originalLanguage.length !== 2) {
        return c.json(
          {error: 'Original language must be a 2-letter ISO 639-1 code'},
          400,
        );
      }

      updateData.originalLanguage = originalLanguage || 'en';
    }

    // Validate mediaType if provided
    if (mediaType !== undefined) {
      if (mediaType !== 'movie' && mediaType !== 'tv') {
        return c.json({error: "mediaType must be 'movie' or 'tv'"}, 400);
      }

      updateData.mediaType = mediaType;
    }

    // Update movie
    if (Object.keys(updateData).length > 0) {
      await database
        .update(movies)
        .set(updateData)
        .where(eq(movies.uid, movieId));
      await invalidateMovieCaches(c.env, movieId);
    }

    return c.json({success: true});
  } catch (error) {
    console.error('Error updating movie:', error);
    return c.json({error: 'Internal server error'}, 500);
  }
});

// Update movie IMDB ID
adminMoviesRoutes.put('/movies/:id/imdb-id', authMiddleware, async c => {
  try {
    const movieId = c.req.param('id');
    if (!movieId) {
      return c.json({error: 'Missing id parameter'}, 400);
    }

    const {imdbId, refreshData = false} = await c.req.json();

    const refreshResults = await new MovieImportService(c.env).updateIMDbId(
      movieId,
      {
        imdbId,
        fetchTMDBData: refreshData,
      },
    );

    await invalidateMovieCaches(c.env, movieId);

    return c.json({
      success: true,
      refreshResults: refreshData ? refreshResults : undefined,
    });
  } catch (error) {
    console.error('Error updating IMDB ID:', error);

    if (error instanceof NotFoundError) {
      return c.json({error: error.message}, 404);
    }

    if (error instanceof ValidationError) {
      return c.json({error: error.message}, 400);
    }

    if (error instanceof ConflictError) {
      return c.json({error: error.message}, 409);
    }

    return c.json({error: 'Internal server error'}, 500);
  }
});

// Update movie TMDb ID
adminMoviesRoutes.put('/movies/:id/tmdb-id', authMiddleware, async c => {
  try {
    const database = getDatabase(c.env);
    const movieId = c.req.param('id');
    if (!movieId) {
      return c.json({error: 'Missing id parameter'}, 400);
    }

    const {
      tmdbId,
      refreshData = false,
      mediaType: bodyMediaType,
    } = await c.req.json();

    // Validate TMDb ID (must be a positive integer)
    if (
      tmdbId !== undefined &&
      (typeof tmdbId !== 'number' ||
        !Number.isSafeInteger(tmdbId) ||
        tmdbId <= 0)
    ) {
      return c.json({error: 'TMDb ID must be a positive integer'}, 400);
    }

    // Check if movie exists
    const movieExists = await database
      .select({
        uid: movies.uid,
        imdbId: movies.imdbId,
        mediaType: movies.mediaType,
      })
      .from(movies)
      .where(eq(movies.uid, movieId))
      .limit(1);

    if (movieExists.length === 0) {
      return c.json({error: 'Movie not found'}, 404);
    }

    // Determine mediaType
    const updateMediaType: 'movie' | 'tv' =
      bodyMediaType === 'tv'
        ? 'tv'
        : (movieExists[0].mediaType as 'movie' | 'tv') || 'movie';

    // Check if TMDb ID is already used by another movie
    if (typeof tmdbId === 'number') {
      const existingMovie = await database
        .select({uid: movies.uid})
        .from(movies)
        .where(
          and(
            eq(movies.tmdbId, tmdbId),
            eq(movies.mediaType, updateMediaType),
            not(eq(movies.uid, movieId)),
          ),
        )
        .limit(1);

      if (existingMovie.length > 0) {
        return c.json({error: 'TMDb ID is already used by another movie'}, 409);
      }
    }

    // Update TMDb ID and mediaType
    await database
      .update(movies)
      .set({
        tmdbId: typeof tmdbId === 'number' ? tmdbId : undefined,
        mediaType: updateMediaType,
      })
      .where(eq(movies.uid, movieId));

    // If refreshData is true and tmdbId is provided, fetch additional data from TMDb
    let refreshResults: TmdbSyncResult = {
      postersAdded: 0,
      translationsAdded: 0,
    };

    if (refreshData && typeof tmdbId === 'number' && c.env.TMDB_API_KEY) {
      try {
        refreshResults = await syncTmdbData(
          database,
          movieId,
          tmdbId,
          updateMediaType,
          c.env,
        );
      } catch (refreshError) {
        console.warn('Error during data refresh:', refreshError);
        // Continue without failing the main operation
      }
    }

    await invalidateMovieCaches(c.env, movieId);

    return c.json({
      success: true,
      refreshResults: refreshData ? refreshResults : undefined,
    });
  } catch (error) {
    console.error('Error updating TMDb ID:', error);
    return c.json({error: 'Internal server error'}, 500);
  }
});

// Auto-fetch TMDb data using IMDb ID
adminMoviesRoutes.post(
  '/movies/:id/auto-fetch-tmdb',
  authMiddleware,
  async c => {
    try {
      const database = getDatabase(c.env);
      const movieId = c.req.param('id');
      if (!movieId) {
        return c.json({error: 'Missing id parameter'}, 400);
      }

      // Check if movie exists and has IMDb ID
      const movie = await database
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
        return c.json({error: 'Movie not found'}, 404);
      }

      const {imdbId, tmdbId} = movie[0];
      if (!imdbId) {
        return c.json({error: 'Movie does not have an IMDb ID'}, 400);
      }

      const tmdbApiKey = c.env.TMDB_API_KEY;
      if (!tmdbApiKey || tmdbApiKey === '') {
        return c.json({error: 'TMDb API key not configured'}, 500);
      }

      const fetchResults = {
        tmdbIdSet: false,
        postersAdded: 0,
        translationsAdded: 0,
      };

      try {
        // Import TMDb utilities
        const {findTMDBByImdbId} =
          await import('@shine/scrapers/common/tmdb-utilities');

        let movieTmdbId: number | undefined = tmdbId ?? undefined;
        let detectedMediaType: 'movie' | 'tv' =
          (movie[0].mediaType as 'movie' | 'tv') || 'movie';

        // Find TMDb ID if not already set
        if (!movieTmdbId) {
          const findResult = await findTMDBByImdbId(imdbId, tmdbApiKey);

          if (!findResult) {
            return c.json({error: 'TMDb映画が見つかりませんでした'}, 404);
          }

          movieTmdbId = findResult.tmdbId;
          detectedMediaType = findResult.mediaType;

          // Check if TMDb ID is already used by another movie
          const existingMovie = await database
            .select({uid: movies.uid})
            .from(movies)
            .where(
              and(
                eq(movies.tmdbId, movieTmdbId),
                eq(movies.mediaType, detectedMediaType),
                not(eq(movies.uid, movieId)),
              ),
            )
            .limit(1);

          if (existingMovie.length > 0) {
            return c.json(
              {error: 'このTMDb IDは既に他の映画で使用されています'},
              409,
            );
          }

          // Save TMDb ID and mediaType to database
          try {
            await database
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
          database,
          movieId,
          movieTmdbId,
          detectedMediaType,
          c.env,
        );
        fetchResults.postersAdded = syncResult.postersAdded;
        fetchResults.translationsAdded = syncResult.translationsAdded;

        await invalidateMovieCaches(c.env, movieId);

        return c.json({
          success: true,
          fetchResults,
        });
      } catch (fetchError) {
        console.error('Error during TMDb auto-fetch:', fetchError);
        const errorMessage =
          fetchError instanceof Error ? fetchError.message : 'Unknown error';
        return c.json(
          {
            error: 'TMDbデータの自動取得に失敗しました',
            details: errorMessage,
          },
          500,
        );
      }
    } catch (error) {
      console.error('Error auto-fetching TMDb data:', error);
      return c.json({error: 'Internal server error'}, 500);
    }
  },
);

// Refresh TMDb data (posters and translations)
adminMoviesRoutes.post('/movies/:id/refresh-tmdb', authMiddleware, async c => {
  try {
    const database = getDatabase(c.env);
    const movieId = c.req.param('id');
    if (!movieId) {
      return c.json({error: 'Missing id parameter'}, 400);
    }

    // Check if movie exists and has TMDb ID
    const movie = await database
      .select({
        uid: movies.uid,
        tmdbId: movies.tmdbId,
        mediaType: movies.mediaType,
      })
      .from(movies)
      .where(eq(movies.uid, movieId))
      .limit(1);

    if (movie.length === 0) {
      return c.json({error: 'Movie not found'}, 404);
    }

    const {tmdbId} = movie[0];
    if (!tmdbId) {
      return c.json({error: 'Movie does not have a TMDb ID'}, 400);
    }

    if (!c.env.TMDB_API_KEY) {
      return c.json({error: 'TMDb API key not configured'}, 500);
    }

    const refreshMediaType = (movie[0].mediaType as 'movie' | 'tv') || 'movie';

    try {
      const refreshResults = await syncTmdbData(
        database,
        movieId,
        tmdbId,
        refreshMediaType,
        c.env,
      );

      await invalidateMovieCaches(c.env, movieId);

      return c.json({
        success: true,
        refreshResults,
      });
    } catch (refreshError) {
      console.error('Error during TMDb data refresh:', refreshError);
      return c.json({error: 'Failed to refresh TMDb data'}, 500);
    }
  } catch (error) {
    console.error('Error refreshing TMDb data:', error);
    return c.json({error: 'Internal server error'}, 500);
  }
});

// Merge movies - combines source movie data into target movie and deletes source
adminMoviesRoutes.post(
  '/movies/:sourceId/merge/:targetId',
  authMiddleware,
  async c => {
    try {
      const sourceId = c.req.param('sourceId');
      const targetId = c.req.param('targetId');
      if (!sourceId || !targetId) {
        return c.json({error: 'Missing sourceId or targetId parameter'}, 400);
      }

      if (sourceId === targetId) {
        return c.json(
          {error: 'Source and target cannot be the same movie'},
          400,
        );
      }

      await new MovieMergeService(c.env).mergeMovies({
        sourceMovieId: sourceId,
        targetMovieId: targetId,
      });

      await invalidateMovieDetailsCache(c.env, sourceId);
      await invalidateMovieCaches(c.env, targetId);

      return c.json({
        success: true,
        message: `Movie ${sourceId} successfully merged into ${targetId}`,
      });
    } catch (error) {
      console.error('Error merging movies:', error);

      if (error instanceof NotFoundError) {
        return c.json({error: error.message}, 404);
      }

      return c.json(
        {
          error: 'Internal server error',
          details: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  },
);
