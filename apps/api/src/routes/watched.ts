import type {Environment} from '@shine/database';
import {Hono} from 'hono';
import {WatchedService} from '../services/watched-service';
import {
  createCachedResponse,
  createETag,
  EdgeCache,
  IMPORTED_DATA_EDGE_TTL,
  shouldCheckETag,
  writeCacheAfterResponse,
} from '../utils/cache';

export const watchedRoutes = new Hono<{Bindings: Environment}>();

const WATCHED_LISTS_CACHE_TTL = 604_800;
const WATCHED_LISTS_CACHE_KEY = 'watched:lists:v1';

watchedRoutes.get('/lists', async c => {
  const cache = new EdgeCache(undefined, c.env.CACHE_KV);
  const cached = await cache.get(WATCHED_LISTS_CACHE_KEY, {
    edgeTtl: IMPORTED_DATA_EDGE_TTL,
  });
  const result = (cached?.data as {lists: unknown[]} | undefined) ?? {
    lists: await new WatchedService(c.env).listWatchedLists(),
  };

  if (!cached) {
    await writeCacheAfterResponse(
      c,
      cache.set(WATCHED_LISTS_CACHE_KEY, result, WATCHED_LISTS_CACHE_TTL),
    );
  }

  const etag = createETag(result);
  if (shouldCheckETag(c.req, etag)) {
    return new Response(undefined, {status: 304, headers: {ETag: etag}});
  }

  return createCachedResponse(result, WATCHED_LISTS_CACHE_TTL, {
    ETag: etag,
    'X-Cache-Status': cached ? 'HIT' : 'MISS',
  });
});
