import {type Environment} from '@shine/database';
import {Hono} from 'hono';
import {authMiddleware} from '../../auth';
import {sanitizeText} from '../../middleware/sanitizer';
import {
  AdminMoviesService,
  ExternalIdSearchService,
  MovieImportService,
  MovieMergeService,
  MovieTmdbService,
  SelectionsService,
} from '../../services';
import {
  ConflictError,
  NotFoundError,
  TmdbConfigError,
  TmdbSyncError,
  ValidationError,
} from '../../services/errors';
import {
  invalidateMovieCaches,
  invalidateMovieDetailsCache,
} from '../../services/movie-cache-invalidation';
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
    const movieId = c.req.param('id');
    if (!movieId) {
      return c.json({error: 'Missing id parameter'}, 400);
    }

    const {year, originalLanguage, mediaType} = await c.req.json();

    await new AdminMoviesService(c.env).updateMovie(movieId, {
      year,
      originalLanguage,
      mediaType,
    });

    return c.json({success: true});
  } catch (error) {
    console.error('Error updating movie:', error);

    if (error instanceof NotFoundError) {
      return c.json({error: error.message}, 404);
    }

    if (error instanceof ValidationError) {
      return c.json({error: error.message}, 400);
    }

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
    const movieId = c.req.param('id');
    if (!movieId) {
      return c.json({error: 'Missing id parameter'}, 400);
    }

    const {tmdbId, refreshData = false, mediaType} = await c.req.json();

    const {refreshResults} = await new MovieTmdbService(c.env).updateTmdbId(
      movieId,
      {tmdbId, refreshData, mediaType},
    );

    return c.json({
      success: true,
      refreshResults,
    });
  } catch (error) {
    console.error('Error updating TMDb ID:', error);

    if (error instanceof ValidationError) {
      return c.json({error: error.message}, 400);
    }

    if (error instanceof NotFoundError) {
      return c.json({error: error.message}, 404);
    }

    if (error instanceof ConflictError) {
      return c.json({error: error.message}, 409);
    }

    return c.json({error: 'Internal server error'}, 500);
  }
});

// Auto-fetch TMDb data using IMDb ID
adminMoviesRoutes.post(
  '/movies/:id/auto-fetch-tmdb',
  authMiddleware,
  async c => {
    try {
      const movieId = c.req.param('id');
      if (!movieId) {
        return c.json({error: 'Missing id parameter'}, 400);
      }

      const fetchResults = await new MovieTmdbService(c.env).autoFetchTmdb(
        movieId,
      );

      return c.json({
        success: true,
        fetchResults,
      });
    } catch (error) {
      console.error('Error auto-fetching TMDb data:', error);

      if (error instanceof NotFoundError) {
        return c.json({error: error.message}, 404);
      }

      if (error instanceof ValidationError) {
        return c.json({error: error.message}, 400);
      }

      if (error instanceof ConflictError) {
        return c.json({error: error.message}, 409);
      }

      if (error instanceof TmdbConfigError) {
        return c.json({error: error.message}, 500);
      }

      if (error instanceof TmdbSyncError) {
        return c.json(
          {
            error: error.message,
            details:
              error.cause instanceof Error
                ? error.cause.message
                : 'Unknown error',
          },
          500,
        );
      }

      return c.json({error: 'Internal server error'}, 500);
    }
  },
);

// Refresh TMDb data (posters and translations)
adminMoviesRoutes.post('/movies/:id/refresh-tmdb', authMiddleware, async c => {
  try {
    const movieId = c.req.param('id');
    if (!movieId) {
      return c.json({error: 'Missing id parameter'}, 400);
    }

    const refreshResults = await new MovieTmdbService(c.env).refreshTmdb(
      movieId,
    );

    return c.json({
      success: true,
      refreshResults,
    });
  } catch (error) {
    console.error('Error refreshing TMDb data:', error);

    if (error instanceof NotFoundError) {
      return c.json({error: error.message}, 404);
    }

    if (error instanceof ValidationError) {
      return c.json({error: error.message}, 400);
    }

    if (error instanceof TmdbConfigError) {
      return c.json({error: error.message}, 500);
    }

    if (error instanceof TmdbSyncError) {
      return c.json({error: error.message}, 500);
    }

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
