import {type Environment} from '@shine/database';
import {Hono} from 'hono';
import {authMiddleware} from '../../auth';
import {AdminService} from '../../services';
import {invalidateMovieCaches} from '../../services/movie-cache-invalidation';

export const adminArticleLinksRoutes = new Hono<{Bindings: Environment}>();

async function invalidateMovieCache(
  environment: Environment,
  movieUid: string | undefined,
) {
  if (!movieUid) {
    return;
  }

  await invalidateMovieCaches(environment, movieUid);
}

// Flag article as spam
adminArticleLinksRoutes.post(
  '/article-links/:id/spam',
  authMiddleware,
  async c => {
    try {
      const adminService = new AdminService(c.env);
      const articleId = c.req.param('id');
      if (!articleId) {
        return c.json({error: 'Missing id parameter'}, 400);
      }

      const movieUid = await adminService.flagArticleAsSpam(articleId);
      await invalidateMovieCache(c.env, movieUid);

      return c.json({success: true});
    } catch (error) {
      console.error('Error flagging article as spam:', error);
      return c.json({error: 'Internal server error'}, 500);
    }
  },
);

// Delete article link
adminArticleLinksRoutes.delete(
  '/article-links/:id',
  authMiddleware,
  async c => {
    try {
      const adminService = new AdminService(c.env);
      const articleId = c.req.param('id');
      if (!articleId) {
        return c.json({error: 'Missing id parameter'}, 400);
      }

      const movieUid = await adminService.deleteArticleLink(articleId);
      await invalidateMovieCache(c.env, movieUid);

      return c.json({success: true});
    } catch (error) {
      console.error('Error deleting article link:', error);
      return c.json({error: 'Internal server error'}, 500);
    }
  },
);
