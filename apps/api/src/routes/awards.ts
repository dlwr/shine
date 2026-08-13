import type {Environment} from '@shine/database';
import {Hono} from 'hono';
import {AwardsService} from '../services';
import {
  checkETag,
  createCachedResponse,
  createETag,
  EdgeCache,
} from '../utils/cache';

export const awardsRoutes = new Hono<{Bindings: Environment}>();

const AWARDS_CACHE_TTL = 604_800;
const cache = new EdgeCache();

awardsRoutes.get('/', async c => {
  const cacheKey = 'awards:list:v1';
  const cached = await cache.get(cacheKey);
  const result = (cached?.data as {awards: unknown[]} | undefined) ?? {
    awards: await new AwardsService(c.env).listAwards(),
  };

  if (!cached) {
    await cache.set(cacheKey, result, AWARDS_CACHE_TTL);
  }

  const etag = createETag(result);
  if (checkETag(c.req, etag)) {
    return new Response(undefined, {status: 304, headers: {ETag: etag}});
  }

  return createCachedResponse(result, AWARDS_CACHE_TTL, {ETag: etag});
});

awardsRoutes.get('/:slug', async c => {
  const slug = c.req.param('slug');
  const cacheKey = `awards:${slug}:v1`;
  const cached = await cache.get(cacheKey);
  const award =
    cached?.data ?? (await new AwardsService(c.env).getAwardBySlug(slug));

  if (!award) {
    return c.json({error: 'Award not found'}, 404);
  }

  if (!cached) {
    await cache.set(cacheKey, award, AWARDS_CACHE_TTL);
  }

  const etag = createETag(award);
  if (checkETag(c.req, etag)) {
    return new Response(undefined, {status: 304, headers: {ETag: etag}});
  }

  return createCachedResponse(award, AWARDS_CACHE_TTL, {ETag: etag});
});

awardsRoutes.get('/:slug/:year', async c => {
  const year = Number.parseInt(c.req.param('year'), 10);
  if (!Number.isInteger(year)) {
    return c.json({error: 'Award not found'}, 404);
  }

  const slug = c.req.param('slug');
  const cacheKey = `awards:${slug}:${year}:v1`;
  const cached = await cache.get(cacheKey);
  const award =
    cached?.data ?? (await new AwardsService(c.env).getAwardYear(slug, year));

  if (!award) {
    return c.json({error: 'Award not found'}, 404);
  }

  if (!cached) {
    await cache.set(cacheKey, award, AWARDS_CACHE_TTL);
  }

  const etag = createETag(award);
  if (checkETag(c.req, etag)) {
    return new Response(undefined, {status: 304, headers: {ETag: etag}});
  }

  return createCachedResponse(award, AWARDS_CACHE_TTL, {ETag: etag});
});
