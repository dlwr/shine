import {type Environment} from '@shine/database';
import {Hono} from 'hono';
import {authMiddleware} from '../../auth';
import {AdminService} from '../../services';
import {invalidateMovieCaches} from '../../services/movie-cache-invalidation';

export const adminPostersRoutes = new Hono<{Bindings: Environment}>();

// Add poster URL
adminPostersRoutes.post('/movies/:id/posters', authMiddleware, async c => {
  try {
    const adminService = new AdminService(c.env);
    const movieId = c.req.param('id');
    if (!movieId) {
      return c.json({error: 'Missing id parameter'}, 400);
    }

    const {
      url,
      width,
      height,
      languageCode,
      isPrimary = false,
    } = await c.req.json();

    // Validate inputs
    if (!url) {
      return c.json({error: 'URL is required'}, 400);
    }

    // Basic URL validation
    let normalizedUrl: string;
    try {
      normalizedUrl = new URL(url).href;
    } catch {
      return c.json({error: 'Invalid URL format'}, 400);
    }

    const newPoster = await adminService.addPoster(movieId, {
      url: normalizedUrl,
      width,
      height,
      language: languageCode,
      source: 'manual',
      isPrimary,
    });

    await invalidateMovieCaches(c.env, movieId);

    return c.json(newPoster);
  } catch (error) {
    console.error('Error adding poster:', error);
    return c.json({error: 'Internal server error'}, 500);
  }
});

// Delete poster URL
adminPostersRoutes.delete(
  '/movies/:movieId/posters/:posterId',
  authMiddleware,
  async c => {
    try {
      const adminService = new AdminService(c.env);
      const movieId = c.req.param('movieId');
      const posterId = c.req.param('posterId');
      if (!movieId || !posterId) {
        return c.json({error: 'Missing movieId or posterId parameter'}, 400);
      }

      await adminService.deletePoster(movieId, posterId);
      await invalidateMovieCaches(c.env, movieId);

      return c.json({success: true});
    } catch (error) {
      console.error('Error deleting poster:', error);
      return c.json({error: 'Internal server error'}, 500);
    }
  },
);
