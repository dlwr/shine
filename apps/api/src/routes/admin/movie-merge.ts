import {type Environment} from '@shine/database';
import {Hono} from 'hono';
import {authMiddleware} from '../../auth';
import {MovieMergeService} from '../../services';
import {NotFoundError} from '../../services/errors';
import {
  invalidateMovieCaches,
  invalidateMovieDetailsCache,
} from '../../services/movie-cache-invalidation';

export const adminMovieMergeRoutes = new Hono<{Bindings: Environment}>();

adminMovieMergeRoutes.post(
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
