import type {Environment} from '@shine/database';
import {Hono} from 'hono';
import {UncrownedService} from '../services/uncrowned-service';
import {
  createCachedResponse,
  createETag,
  EdgeCache,
  IMPORTED_DATA_EDGE_TTL,
  shouldCheckETag,
} from '../utils/cache';
import {readThroughCache} from '../utils/read-through-cache';

export const uncrownedRoutes = new Hono<{Bindings: Environment}>();

const UNCROWNED_CACHE_TTL = 604_800;
const UNCROWNED_CACHE_KEY = 'uncrowned:v12';

uncrownedRoutes.get('/', async c => {
  const cache = new EdgeCache(undefined, c.env.CACHE_KV);
  const {data: result, status} = await readThroughCache(c, cache, {
    key: UNCROWNED_CACHE_KEY,
    ttl: UNCROWNED_CACHE_TTL,
    edgeTtl: IMPORTED_DATA_EDGE_TTL,
    load: async () => new UncrownedService(c.env).getUncrowned(),
  });

  const etag = createETag(result);
  if (shouldCheckETag(c.req, etag)) {
    return new Response(undefined, {status: 304, headers: {ETag: etag}});
  }

  return createCachedResponse(result, UNCROWNED_CACHE_TTL, {
    ETag: etag,
    'X-Cache-Status': status,
  });
});
