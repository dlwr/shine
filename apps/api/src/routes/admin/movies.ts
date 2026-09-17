import {type Environment} from '@shine/database';
import {Hono} from 'hono';
import {authMiddleware} from '../../auth';
import {sanitizeText} from '../../middleware/sanitizer';
import {
  AdminMoviesService,
  AdminSelectionsService,
  MovieImportService,
  MovieMergeService,
} from '../../services';
import {invalidateMovieDetailsCache} from '../../services/movie-cache-invalidation';
import {parsePagination} from '../../utils/pagination';
import {serviceErrorResponse} from './service-error-response';

export const adminMoviesRoutes = new Hono<{Bindings: Environment}>();

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
    return (
      serviceErrorResponse(c, error) ??
      c.json({error: 'Internal server error'}, 500)
    );
  }
});

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

    const result = await new MovieImportService(c.env).createMovieFromImdbId(
      sanitizeText(imdbId),
      {fetchTMDBData: refreshData !== false},
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
    return (
      serviceErrorResponse(c, error) ??
      c.json({error: 'Internal server error'}, 500)
    );
  }
});

adminMoviesRoutes.delete('/movies/:id', authMiddleware, async c => {
  try {
    const movieId = c.req.param('id');
    if (!movieId) {
      return c.json({error: 'Missing id parameter'}, 400);
    }

    await new AdminSelectionsService(c.env).purgeSelectionCachesForMovie(
      movieId,
    );
    await new MovieMergeService(c.env).deleteMovie(movieId);
    await invalidateMovieDetailsCache(c.env, movieId);

    return c.json({success: true});
  } catch (error) {
    console.error('Error deleting movie:', error);
    return c.json({error: 'Internal server error'}, 500);
  }
});

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
    return (
      serviceErrorResponse(c, error) ??
      c.json({error: 'Internal server error'}, 500)
    );
  }
});
