import type {Environment} from '@shine/database';
import {Hono} from 'hono';
import {CrossingsService} from '../services/crossings-service';
import {
  shouldCheckETag,
  createCachedResponse,
  createETag,
  EdgeCache,
} from '../utils/cache';

export const crossingsRoutes = new Hono<{Bindings: Environment}>();

const CROSSINGS_CACHE_TTL = 604_800;
const CROSSINGS_CACHE_KEY = 'crossings:v6';

crossingsRoutes.get('/', async c => {
  const cache = new EdgeCache(undefined, c.env.CACHE_KV);
  const cached = await cache.get(CROSSINGS_CACHE_KEY);
  const result =
    cached?.data ?? (await new CrossingsService(c.env).getCrossings());

  if (!cached) {
    await cache.set(CROSSINGS_CACHE_KEY, result, CROSSINGS_CACHE_TTL);
  }

  const etag = createETag(result);
  if (shouldCheckETag(c.req, etag)) {
    return new Response(undefined, {status: 304, headers: {ETag: etag}});
  }

  return createCachedResponse(result, CROSSINGS_CACHE_TTL, {ETag: etag});
});
