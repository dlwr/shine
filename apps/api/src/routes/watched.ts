import type {Environment} from '@shine/database';
import {Hono} from 'hono';
import type {WatchedListsResponse} from '../types/responses';
import {WatchedService} from '../services/watched-service';
import {
  createCachedResponse,
  createETag,
  EdgeCache,
  IMPORTED_DATA_EDGE_TTL,
  shouldCheckETag,
} from '../utils/cache';
import {readThroughCache} from '../utils/read-through-cache';

export const watchedRoutes = new Hono<{Bindings: Environment}>();

const WATCHED_LISTS_CACHE_TTL = 604_800;
const WATCHED_LISTS_CACHE_KEY = 'watched:lists:v1';

watchedRoutes.get('/lists', async c => {
  const cache = new EdgeCache(undefined, c.env.CACHE_KV);
  const {data: result, status} = await readThroughCache<WatchedListsResponse>(
    c,
    cache,
    {
      key: WATCHED_LISTS_CACHE_KEY,
      ttl: WATCHED_LISTS_CACHE_TTL,
      edgeTtl: IMPORTED_DATA_EDGE_TTL,
      load: async () => ({
        lists: await new WatchedService(c.env).listWatchedLists(),
      }),
    },
  );

  const etag = createETag(result);
  if (shouldCheckETag(c.req, etag)) {
    return new Response(undefined, {status: 304, headers: {ETag: etag}});
  }

  return createCachedResponse(result, WATCHED_LISTS_CACHE_TTL, {
    ETag: etag,
    'X-Cache-Status': status,
  });
});
