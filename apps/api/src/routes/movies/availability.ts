import {type Environment} from '@shine/database';
import {Hono} from 'hono';
import {AvailabilityService, buildOnDemandRunners} from '../../services';
import {resolveClientIp} from '../../utils/client-ip';

export const movieAvailabilityRoutes = new Hono<{Bindings: Environment}>();

movieAvailabilityRoutes.post('/:id/availability/check', async c => {
  const limiter = c.env.AVAILABILITY_RATE_LIMITER;
  if (limiter) {
    const {success} = await limiter.limit({key: resolveClientIp(c)});
    if (!success) {
      return c.json(
        {error: 'Rate limit exceeded. Please try again later.'},
        429,
        {'Retry-After': '60'},
      );
    }
  }

  try {
    const service = new AvailabilityService(c.env);
    const background: Array<Promise<void>> = [];
    const result = await service.checkMovie(
      c.req.param('id'),
      buildOnDemandRunners(c.env),
      {
        defer(task) {
          background.push(task);
        },
      },
    );

    for (const task of background) {
      try {
        c.executionCtx.waitUntil(task);
      } catch {
        await task;
      }
    }

    if (!result) {
      return c.json({error: 'Movie not found'}, 404);
    }

    return c.json(result);
  } catch (error) {
    console.error('Error checking availability:', error);
    return c.json({error: 'Internal server error'}, 500);
  }
});
