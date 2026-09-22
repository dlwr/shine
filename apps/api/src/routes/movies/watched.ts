import {
  and,
  eq,
  getDatabase,
  gt,
  isNull,
  sql,
  type Environment,
} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {watchedMarks} from '@shine/database/schema/watched-marks';
import {Hono} from 'hono';
import {hasValidAdminToken} from '../../auth';
import {invalidateMovieCaches} from '../../services/movie-cache-invalidation';
import {countWatchedMarks} from '../../services/watched-marks';
import {resolveClientIp} from '../../utils/client-ip';
import type {WatchedMarkResponse} from '../../types/responses';

export const WATCHED_MARKS_PER_HOUR = 30;

export const movieWatchedRoutes = new Hono<{Bindings: Environment}>();

movieWatchedRoutes.post('/:id/watched', async c => {
  try {
    const movieId = c.req.param('id');
    const database = getDatabase(c.env);

    const movieExists = await database
      .select({uid: movies.uid})
      .from(movies)
      .where(and(eq(movies.uid, movieId), isNull(movies.deletedAt)))
      .limit(1);
    if (movieExists.length === 0) {
      return c.json({error: 'Movie not found'}, 404);
    }

    const ip = resolveClientIp(c);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const [recent] = await database
      .select({count: sql<number>`count(*)`})
      .from(watchedMarks)
      .where(
        and(
          eq(watchedMarks.submitterIp, ip),
          gt(watchedMarks.markedAt, oneHourAgo),
        ),
      );
    if (recent.count >= WATCHED_MARKS_PER_HOUR) {
      return c.json(
        {error: 'Rate limit exceeded. Please try again later.'},
        429,
      );
    }

    const inserted = await database
      .insert(watchedMarks)
      .values({
        movieUid: movieId,
        submitterIp: ip,
        isOwner: await hasValidAdminToken(c),
      })
      .onConflictDoNothing()
      .returning({uid: watchedMarks.uid});

    if (inserted.length > 0) {
      await invalidateMovieCaches(c.env, movieId);
    }

    const body: WatchedMarkResponse = {
      watchedCount: await countWatchedMarks(database, movieId),
    };
    return c.json(body, inserted.length > 0 ? 201 : 200);
  } catch (error) {
    console.error('Error marking movie as watched:', error);
    return c.json({error: 'Internal server error'}, 500);
  }
});
