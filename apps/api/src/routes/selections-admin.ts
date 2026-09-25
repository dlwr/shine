import {getDatabase, type Environment} from '@shine/database';
import {Hono} from 'hono';
import {authMiddleware} from '../auth';
import {AdminSelectionsService, SelectionsService} from '../services';
import {isSelectionType} from '../services/selection-dates';
import {loadSelectionMovie} from '../services/selection-movie';
import {pickNominatedMovieUid} from '../services/selection-pick';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_EXCLUDED_MOVIES = 50;

export const selectionsAdminRoutes = new Hono<{Bindings: Environment}>();

selectionsAdminRoutes.post('/reselect', authMiddleware, async c => {
  try {
    const body = await c.req.json();
    const {type, locale = 'en', excludeMovieUids = [], date} = body;

    if (!isSelectionType(type)) {
      return c.json({error: 'Invalid selection type'}, 400);
    }

    if (
      !Array.isArray(excludeMovieUids) ||
      excludeMovieUids.length > MAX_EXCLUDED_MOVIES ||
      excludeMovieUids.some(uid => typeof uid !== 'string')
    ) {
      return c.json({error: 'Invalid excludeMovieUids'}, 400);
    }

    if (date !== undefined && !DATE_PATTERN.test(String(date))) {
      return c.json({error: 'Date must be in YYYY-MM-DD format'}, 400);
    }

    const targetDate = date
      ? new Date(`${String(date)}T00:00:00.000Z`)
      : new Date();

    const movie = await new AdminSelectionsService(c.env).reselectMovie(
      type,
      locale,
      targetDate,
      excludeMovieUids,
    );

    return c.json({type, movie});
  } catch (error) {
    console.error('Error reselecting movie:', error);
    return c.json({error: 'Internal server error'}, 500);
  }
});

selectionsAdminRoutes.get(
  '/admin/preview-selections',
  authMiddleware,
  async c => {
    try {
      const locale = c.req.query('locale') || 'en';
      const previews = await new SelectionsService(c.env).getNextPeriodPreviews(
        locale,
      );

      return c.json(previews);
    } catch (error) {
      console.error('Error previewing next selections:', error);
      return c.json({error: 'Internal server error'}, 500);
    }
  },
);

selectionsAdminRoutes.delete(
  '/admin/cleanup-future-selections',
  authMiddleware,
  async c => {
    try {
      const result = await new AdminSelectionsService(
        c.env,
      ).deleteFutureSelections();

      return c.json({success: true, ...result});
    } catch (error) {
      console.error('Error cleaning up future selections:', error);
      return c.json({error: 'Internal server error'}, 500);
    }
  },
);

selectionsAdminRoutes.post(
  '/admin/random-movie-preview',
  authMiddleware,
  async c => {
    try {
      const database = getDatabase(c.env);
      const {locale = 'en'} = await c.req.json<{locale?: string}>();

      const movieUid = await pickNominatedMovieUid(database, 'random');
      if (!movieUid) {
        return c.json({error: 'No nominations found'}, 404);
      }

      return c.json(await loadSelectionMovie(database, movieUid, locale));
    } catch (error) {
      console.error('Error generating random movie preview:', error);
      return c.json({error: 'Internal server error'}, 500);
    }
  },
);

selectionsAdminRoutes.post(
  '/admin/override-selection',
  authMiddleware,
  async c => {
    try {
      const {type, date, movieId} = await c.req.json();

      if (!isSelectionType(type)) {
        return c.json({error: 'Invalid selection type'}, 400);
      }

      if (!date) {
        return c.json({error: 'Date is required'}, 400);
      }

      if (!movieId) {
        return c.json({error: 'Movie ID is required'}, 400);
      }

      if (!DATE_PATTERN.test(date)) {
        return c.json({error: 'Date must be in YYYY-MM-DD format'}, 400);
      }

      await new AdminSelectionsService(c.env).overrideSelection(
        type,
        movieId,
        new Date(`${String(date)}T00:00:00.000Z`),
      );

      return c.json({success: true});
    } catch (error) {
      console.error('Error overriding selection:', error);

      if (error instanceof Error && error.message === 'Movie not found') {
        return c.json({error: 'Movie not found'}, 404);
      }

      return c.json({error: 'Internal server error'}, 500);
    }
  },
);
