import {type Environment} from '@shine/database';
import {Hono} from 'hono';
import {authMiddleware} from '../../auth';
import {AdminService} from '../../services';

export const adminArticleLinksRoutes = new Hono<{Bindings: Environment}>();

// Flag article as spam
adminArticleLinksRoutes.post('/article-links/:id/spam', authMiddleware, async c => {
  try {
    const adminService = new AdminService(c.env);
    const articleId = c.req.param('id');
    if (!articleId) {
      return c.json({error: 'Missing id parameter'}, 400);
    }

    await adminService.flagArticleAsSpam(articleId);

    return c.json({success: true});
  } catch (error) {
    console.error('Error flagging article as spam:', error);
    return c.json({error: 'Internal server error'}, 500);
  }
});

// Delete article link
adminArticleLinksRoutes.delete('/article-links/:id', authMiddleware, async c => {
  try {
    const adminService = new AdminService(c.env);
    const articleId = c.req.param('id');
    if (!articleId) {
      return c.json({error: 'Missing id parameter'}, 400);
    }

    await adminService.deleteArticleLink(articleId);

    return c.json({success: true});
  } catch (error) {
    console.error('Error deleting article link:', error);
    return c.json({error: 'Internal server error'}, 500);
  }
});
