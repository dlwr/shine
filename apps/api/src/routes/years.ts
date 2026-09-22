import type {Environment} from '@shine/database';
import {Hono} from 'hono';
import type {YearsListResponse} from '../types/responses';
import {YearsService} from '../services/years-service';
import {
  createCachedResponse,
  createETag,
  EdgeCache,
  IMPORTED_DATA_EDGE_TTL,
  shouldCheckETag,
} from '../utils/cache';
import {readThroughCache} from '../utils/read-through-cache';

export const yearsRoutes = new Hono<{Bindings: Environment}>();

const YEARS_CACHE_TTL = 604_800;

yearsRoutes.get('/', async c => {
  const cache = new EdgeCache(undefined, c.env.CACHE_KV);
  const {data: result, status} = await readThroughCache<YearsListResponse>(
    c,
    cache,
    {
      key: 'years:list:v3',
      ttl: YEARS_CACHE_TTL,
      edgeTtl: IMPORTED_DATA_EDGE_TTL,
      load: async () => ({years: await new YearsService(c.env).listYears()}),
    },
  );

  const etag = createETag(result);
  if (shouldCheckETag(c.req, etag)) {
    return new Response(undefined, {status: 304, headers: {ETag: etag}});
  }

  return createCachedResponse(result, YEARS_CACHE_TTL, {
    ETag: etag,
    'X-Cache-Status': status,
  });
});

yearsRoutes.get('/:year', async c => {
  const year = Number(c.req.param('year'));
  if (!Number.isSafeInteger(year)) {
    return c.json({error: 'Year not found'}, 404);
  }

  const cache = new EdgeCache(undefined, c.env.CACHE_KV);
  const {data: detail, status} = await readThroughCache(c, cache, {
    key: `years:${year}:v3`,
    ttl: YEARS_CACHE_TTL,
    edgeTtl: IMPORTED_DATA_EDGE_TTL,
    load: async () => new YearsService(c.env).getYear(year),
  });

  if (!detail) {
    return c.json({error: 'Year not found'}, 404);
  }

  const etag = createETag(detail);
  if (shouldCheckETag(c.req, etag)) {
    return new Response(undefined, {status: 304, headers: {ETag: etag}});
  }

  return createCachedResponse(detail, YEARS_CACHE_TTL, {
    ETag: etag,
    'X-Cache-Status': status,
  });
});
