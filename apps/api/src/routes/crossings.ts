import type {Environment} from '@shine/database';
import {Hono} from 'hono';
import {CrossingsService} from '../services/crossings-service';
import {
  createCachedResponse,
  createETag,
  EdgeCache,
  IMPORTED_DATA_EDGE_TTL,
  shouldCheckETag,
} from '../utils/cache';
import {readThroughCache} from '../utils/read-through-cache';

export const crossingsRoutes = new Hono<{Bindings: Environment}>();

const CROSSINGS_CACHE_TTL = 604_800;
const CROSSINGS_CACHE_KEY = 'crossings:v12';

crossingsRoutes.get('/', async c => {
  const cache = new EdgeCache(undefined, c.env.CACHE_KV);
  const {data: result, status} = await readThroughCache(c, cache, {
    key: CROSSINGS_CACHE_KEY,
    ttl: CROSSINGS_CACHE_TTL,
    edgeTtl: IMPORTED_DATA_EDGE_TTL,
    load: async () => new CrossingsService(c.env).getCrossings(),
  });

  const etag = createETag(result);
  if (shouldCheckETag(c.req, etag)) {
    return new Response(undefined, {status: 304, headers: {ETag: etag}});
  }

  return createCachedResponse(result, CROSSINGS_CACHE_TTL, {
    ETag: etag,
    'X-Cache-Status': status,
  });
});
