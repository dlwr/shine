import type {Environment} from '@shine/database';
import {Hono} from 'hono';
import {OnThisDayService} from '../services/on-this-day-service';
import {
  createCachedResponse,
  createETag,
  EdgeCache,
  IMPORTED_DATA_EDGE_TTL,
  shouldCheckETag,
} from '../utils/cache';
import {readThroughCache} from '../utils/read-through-cache';

export const onThisDayRoutes = new Hono<{Bindings: Environment}>();

const ON_THIS_DAY_CACHE_TTL = 604_800;

function isMonthDay(value: string): boolean {
  const match = /^(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }

  const month = Number(match[1]);
  const day = Number(match[2]);
  const date = new Date(Date.UTC(2000, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

onThisDayRoutes.get('/:monthDay', async c => {
  const monthDay = c.req.param('monthDay');
  if (!isMonthDay(monthDay)) {
    return c.json({error: 'Date not found'}, 404);
  }

  const cache = new EdgeCache(c.env.CACHE_KV);
  const {data: result, status} = await readThroughCache(c, cache, {
    key: `on-this-day:${monthDay}:v3`,
    ttl: ON_THIS_DAY_CACHE_TTL,
    edgeTtl: IMPORTED_DATA_EDGE_TTL,
    load: async () => new OnThisDayService(c.env).getOnThisDay(monthDay),
  });

  const etag = createETag(result);
  if (shouldCheckETag(c.req, etag)) {
    return new Response(undefined, {status: 304, headers: {ETag: etag}});
  }

  return createCachedResponse(result, ON_THIS_DAY_CACHE_TTL, {
    ETag: etag,
    'X-Cache-Status': status,
  });
});
