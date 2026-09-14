import {type Environment} from '@shine/database';
import {Hono} from 'hono';
import {authMiddleware} from '../../auth';
import {sanitizeText} from '../../middleware/sanitizer';
import {MoviesService} from '../../services';
import {invalidateMovieCaches} from '../../services/movie-cache-invalidation';

export const movieTranslationsRoutes = new Hono<{Bindings: Environment}>();

// Add or update movie translation
movieTranslationsRoutes.post('/:id/translations', authMiddleware, async c => {
  try {
    const moviesService = new MoviesService(c.env);
    const movieId = c.req.param('id');
    if (!movieId) {
      return c.json({error: 'Missing id parameter'}, 400);
    }

    const {
      languageCode,
      content: rawContent,
      isDefault: rawIsDefault,
    } = await c.req.json();

    if (!languageCode || !rawContent) {
      return c.json({error: 'languageCode and content are required'}, 400);
    }

    if (languageCode.length !== 2) {
      return c.json({error: 'Language code must be 2 characters'}, 400);
    }

    const content = sanitizeText(rawContent);
    const isDefault = [true, 1, 'true', '1'].includes(
      rawIsDefault as boolean | number | string,
    );

    await moviesService.addMovieTranslation(
      movieId,
      languageCode,
      content,
      isDefault,
    );

    await invalidateMovieCaches(c.env, movieId);

    console.log(
      `Cache invalidated for movie ${movieId} after translation update`,
    );

    return c.json({success: true});
  } catch (error) {
    console.error('Error adding/updating translation:', error);

    if (error instanceof Error && error.message === 'Movie not found') {
      return c.json({error: 'Movie not found'}, 404);
    }

    return c.json({error: 'Internal server error'}, 500);
  }
});

// Delete movie translation
movieTranslationsRoutes.delete(
  '/:id/translations/:lang',
  authMiddleware,
  async c => {
    try {
      const moviesService = new MoviesService(c.env);
      const movieId = c.req.param('id');
      const languageCode = c.req.param('lang');
      if (!movieId || !languageCode) {
        return c.json({error: 'Missing required parameters'}, 400);
      }

      await moviesService.deleteMovieTranslation(movieId, languageCode);

      await invalidateMovieCaches(c.env, movieId);

      console.log(
        `Cache invalidated for movie ${movieId} after translation deletion`,
      );

      return c.json({success: true});
    } catch (error) {
      console.error('Error deleting translation:', error);
      return c.json({error: 'Internal server error'}, 500);
    }
  },
);
