import {type Environment} from '@shine/database';
import {Hono} from 'hono';
import {AvailabilityService, buildOnDemandRunners} from '../../services';
import {resolveClientIp} from '../../utils/client-ip';

export const movieAvailabilityRoutes = new Hono<{Bindings: Environment}>();

const AVAILABILITY_RATE_LIMIT = 30;
const AVAILABILITY_RATE_WINDOW_MS = 60 * 60 * 1000;
const AVAILABILITY_RATE_LOG_MAX_ENTRIES = 10_000;
const availabilityRequestLog = new Map<
  string,
  {windowStart: number; count: number}
>();

function isAvailabilityRateLimited(ip: string, now = Date.now()): boolean {
  if (availabilityRequestLog.size > AVAILABILITY_RATE_LOG_MAX_ENTRIES) {
    availabilityRequestLog.clear();
  }

  const entry = availabilityRequestLog.get(ip);
  if (!entry || now - entry.windowStart > AVAILABILITY_RATE_WINDOW_MS) {
    availabilityRequestLog.set(ip, {windowStart: now, count: 1});
    return false;
  }

  entry.count++;
  return entry.count > AVAILABILITY_RATE_LIMIT;
}

movieAvailabilityRoutes.post('/:id/availability/check', async c => {
  const ip = resolveClientIp(c);

  if (isAvailabilityRateLimited(ip)) {
    return c.json({error: 'Rate limit exceeded. Please try again later.'}, 429);
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
