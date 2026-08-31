import type {Environment} from '@shine/database';
import {Hono} from 'hono';
import {YearsService} from '../services/years-service';
import {
  shouldCheckETag,
  createCachedResponse,
  createETag,
  EdgeCache,
} from '../utils/cache';

export const yearsRoutes = new Hono<{Bindings: Environment}>();

const YEARS_CACHE_TTL = 604_800;

yearsRoutes.get('/', async c => {
  const cache = new EdgeCache(undefined, c.env.CACHE_KV);
  const cacheKey = 'years:list:v2';
  const cached = await cache.get(cacheKey);
  const result = (cached?.data as {years: unknown[]} | undefined) ?? {
    years: await new YearsService(c.env).listYears(),
  };

  if (!cached) {
    await cache.set(cacheKey, result, YEARS_CACHE_TTL);
  }

  const etag = createETag(result);
  if (shouldCheckETag(c.req, etag)) {
    return new Response(undefined, {status: 304, headers: {ETag: etag}});
  }

  return createCachedResponse(result, YEARS_CACHE_TTL, {
    ETag: etag,
    'X-Cache-Status': cached ? 'HIT' : 'MISS',
  });
});

yearsRoutes.get('/:year', async c => {
  const year = Number(c.req.param('year'));
  if (!Number.isSafeInteger(year)) {
    return c.json({error: 'Year not found'}, 404);
  }

  const cache = new EdgeCache(undefined, c.env.CACHE_KV);
  const cacheKey = `years:${year}:v2`;
  const cached = await cache.get(cacheKey);
  const detail = cached?.data ?? (await new YearsService(c.env).getYear(year));

  if (!detail) {
    return c.json({error: 'Year not found'}, 404);
  }

  if (!cached) {
    await cache.set(cacheKey, detail, YEARS_CACHE_TTL);
  }

  const etag = createETag(detail);
  if (shouldCheckETag(c.req, etag)) {
    return new Response(undefined, {status: 304, headers: {ETag: etag}});
  }

  return createCachedResponse(detail, YEARS_CACHE_TTL, {
    ETag: etag,
    'X-Cache-Status': cached ? 'HIT' : 'MISS',
  });
});
