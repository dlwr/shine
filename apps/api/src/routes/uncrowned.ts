import type {Environment} from '@shine/database';
import {Hono} from 'hono';
import {UncrownedService} from '../services/uncrowned-service';
import {
  shouldCheckETag,
  createCachedResponse,
  createETag,
  EdgeCache,
} from '../utils/cache';

export const uncrownedRoutes = new Hono<{Bindings: Environment}>();

const UNCROWNED_CACHE_TTL = 604_800;
const UNCROWNED_CACHE_KEY = 'uncrowned:v1';

uncrownedRoutes.get('/', async c => {
  const cache = new EdgeCache(undefined, c.env.CACHE_KV);
  const cached = await cache.get(UNCROWNED_CACHE_KEY);
  const result =
    cached?.data ?? (await new UncrownedService(c.env).getUncrowned());

  if (!cached) {
    await cache.set(UNCROWNED_CACHE_KEY, result, UNCROWNED_CACHE_TTL);
  }

  const etag = createETag(result);
  if (shouldCheckETag(c.req, etag)) {
    return new Response(undefined, {status: 304, headers: {ETag: etag}});
  }

  return createCachedResponse(result, UNCROWNED_CACHE_TTL, {ETag: etag});
});
