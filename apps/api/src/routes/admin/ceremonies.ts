import {type Environment} from '@shine/database';
import {Hono} from 'hono';
import {authMiddleware} from '../../auth';
import {sanitizeText} from '../../middleware/sanitizer';
import {
  AdminCeremoniesService,
  CeremonyNominationSyncService,
} from '../../services';
import {
  ConflictError,
  ExternalFetchError,
  NotFoundError,
  UnprocessableContentError,
  ValidationError,
} from '../../services/errors';

export const adminCeremoniesRoutes = new Hono<{Bindings: Environment}>();

adminCeremoniesRoutes.get('/ceremonies', authMiddleware, async c => {
  try {
    const ceremonies = await new AdminCeremoniesService(c.env).listCeremonies();

    return c.json({ceremonies});
  } catch (error) {
    console.error('Error fetching ceremonies list:', error);
    return c.json({error: 'Internal server error'}, 500);
  }
});

adminCeremoniesRoutes.get(
  '/ceremonies/:ceremonyUid',
  authMiddleware,
  async c => {
    try {
      const ceremonyUid = c.req.param('ceremonyUid');

      if (!ceremonyUid) {
        return c.json({error: 'Ceremony UID is required'}, 400);
      }

      const detail = await new AdminCeremoniesService(c.env).getCeremonyDetail(
        ceremonyUid,
      );

      return c.json(detail);
    } catch (error) {
      console.error('Error fetching ceremony detail:', error);

      if (error instanceof NotFoundError) {
        return c.json({error: error.message}, 404);
      }

      return c.json({error: 'Internal server error'}, 500);
    }
  },
);

adminCeremoniesRoutes.post('/ceremonies', authMiddleware, async c => {
  try {
    const body = await c.req.json();

    const detail = await new AdminCeremoniesService(c.env).createCeremony(body);

    return c.json(detail, 201);
  } catch (error) {
    console.error('Error creating ceremony:', error);

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

adminCeremoniesRoutes.put(
  '/ceremonies/:ceremonyUid',
  authMiddleware,
  async c => {
    try {
      const ceremonyUid = c.req.param('ceremonyUid');

      if (!ceremonyUid) {
        return c.json({error: 'Ceremony UID is required'}, 400);
      }

      const body = await c.req.json();

      const detail = await new AdminCeremoniesService(c.env).updateCeremony(
        ceremonyUid,
        body,
      );

      return c.json(detail);
    } catch (error) {
      console.error('Error updating ceremony:', error);

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
  },
);

adminCeremoniesRoutes.post(
  '/ceremonies/:ceremonyUid/sync-imdb',
  authMiddleware,
  async c => {
    try {
      const ceremonyUid = c.req.param('ceremonyUid');

      if (!ceremonyUid) {
        return c.json({error: 'Ceremony UID is required'}, 400);
      }

      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json({error: 'Invalid request body'}, 400);
      }

      const {categoryUid} = (body ?? {}) as {categoryUid?: unknown};

      if (typeof categoryUid !== 'string' || categoryUid.trim() === '') {
        return c.json({error: 'Category UID is required'}, 400);
      }

      const sanitizedCategoryUid = sanitizeText(categoryUid).trim();
      if (sanitizedCategoryUid === '') {
        return c.json({error: 'Category UID is required'}, 400);
      }

      const result = await new CeremonyNominationSyncService(
        c.env,
      ).syncCeremonyNominationsFromImdb(ceremonyUid, {
        categoryUid: sanitizedCategoryUid,
      });

      const detail = await new AdminCeremoniesService(c.env).getCeremonyDetail(
        ceremonyUid,
      );

      return c.json({
        success: true,
        ceremony: detail,
        stats: result,
      });
    } catch (error) {
      console.error('Error syncing ceremony from IMDb:', error);

      if (error instanceof NotFoundError) {
        return c.json({error: error.message}, 404);
      }

      if (error instanceof ValidationError) {
        return c.json({error: error.message}, 400);
      }

      if (error instanceof ExternalFetchError) {
        return c.json({error: error.message}, 502);
      }

      if (error instanceof UnprocessableContentError) {
        return c.json({error: error.message}, 422);
      }

      return c.json({error: 'Internal server error'}, 500);
    }
  },
);

adminCeremoniesRoutes.delete(
  '/ceremonies/:ceremonyUid',
  authMiddleware,
  async c => {
    try {
      const ceremonyUid = c.req.param('ceremonyUid');

      if (!ceremonyUid) {
        return c.json({error: 'Ceremony UID is required'}, 400);
      }

      await new AdminCeremoniesService(c.env).deleteCeremony(ceremonyUid);

      return c.json({success: true});
    } catch (error) {
      console.error('Error deleting ceremony:', error);

      if (error instanceof NotFoundError) {
        return c.json({error: error.message}, 404);
      }

      return c.json({error: 'Internal server error'}, 500);
    }
  },
);

adminCeremoniesRoutes.get('/awards', authMiddleware, async c => {
  try {
    const reference = await new AdminCeremoniesService(
      c.env,
    ).getAwardsReference();

    return c.json(reference);
  } catch (error) {
    console.error('Error fetching awards data:', error);
    return c.json({error: 'Internal server error'}, 500);
  }
});
