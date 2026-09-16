import {type Environment} from '@shine/database';
import {Hono} from 'hono';
import {authMiddleware} from '../../auth';
import {
  ExternalIdSearchService,
  MovieImportService,
  MovieTmdbService,
} from '../../services';
import {TmdbConfigError, TmdbSyncError} from '../../services/errors';
import {invalidateMovieCaches} from '../../services/movie-cache-invalidation';
import {parseExternalIdSearchQuery} from './external-id-search-query';
import {serviceErrorResponse} from './service-error-response';

export const adminMovieExternalIdsRoutes = new Hono<{Bindings: Environment}>();

adminMovieExternalIdsRoutes.get(
  '/movies/:id/external-id-search',
  authMiddleware,
  async c => {
    try {
      const movieId = c.req.param('id');
      if (!movieId) {
        return c.json({error: 'Missing id parameter'}, 400);
      }

      const parsed = parseExternalIdSearchQuery({
        query: c.req.query('query'),
        language: c.req.query('language'),
        year: c.req.query('year'),
        limit: c.req.query('limit'),
      });
      if (!parsed.ok) {
        return c.json({error: parsed.error}, 400);
      }

      const result = await new ExternalIdSearchService(
        c.env,
      ).searchExternalMovieIds(movieId, parsed.options);

      return c.json(result);
    } catch (error) {
      console.error('Error searching external IDs:', error);

      if (error instanceof TmdbConfigError) {
        return c.json({error: 'TMDb API key is not configured'}, 503);
      }

      return (
        serviceErrorResponse(c, error) ??
        c.json({error: 'Internal server error'}, 500)
      );
    }
  },
);

adminMovieExternalIdsRoutes.put(
  '/movies/:id/imdb-id',
  authMiddleware,
  async c => {
    try {
      const movieId = c.req.param('id');
      if (!movieId) {
        return c.json({error: 'Missing id parameter'}, 400);
      }

      const {imdbId, refreshData = false} = await c.req.json();

      const refreshResults = await new MovieImportService(c.env).updateIMDbId(
        movieId,
        {imdbId, fetchTMDBData: refreshData},
      );

      await invalidateMovieCaches(c.env, movieId);

      return c.json({
        success: true,
        refreshResults: refreshData ? refreshResults : undefined,
      });
    } catch (error) {
      console.error('Error updating IMDB ID:', error);
      return (
        serviceErrorResponse(c, error) ??
        c.json({error: 'Internal server error'}, 500)
      );
    }
  },
);

adminMovieExternalIdsRoutes.put(
  '/movies/:id/tmdb-id',
  authMiddleware,
  async c => {
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

      return c.json({success: true, refreshResults});
    } catch (error) {
      console.error('Error updating TMDb ID:', error);
      return (
        serviceErrorResponse(c, error) ??
        c.json({error: 'Internal server error'}, 500)
      );
    }
  },
);

adminMovieExternalIdsRoutes.post(
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

      return c.json({success: true, fetchResults});
    } catch (error) {
      console.error('Error auto-fetching TMDb data:', error);

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

      return (
        serviceErrorResponse(c, error) ??
        c.json({error: 'Internal server error'}, 500)
      );
    }
  },
);

adminMovieExternalIdsRoutes.post(
  '/movies/:id/refresh-tmdb',
  authMiddleware,
  async c => {
    try {
      const movieId = c.req.param('id');
      if (!movieId) {
        return c.json({error: 'Missing id parameter'}, 400);
      }

      const refreshResults = await new MovieTmdbService(c.env).refreshTmdb(
        movieId,
      );

      return c.json({success: true, refreshResults});
    } catch (error) {
      console.error('Error refreshing TMDb data:', error);

      if (error instanceof TmdbConfigError || error instanceof TmdbSyncError) {
        return c.json({error: error.message}, 500);
      }

      return (
        serviceErrorResponse(c, error) ??
        c.json({error: 'Internal server error'}, 500)
      );
    }
  },
);
