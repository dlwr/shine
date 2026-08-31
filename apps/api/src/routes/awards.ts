import type {Environment} from '@shine/database';
import {Hono} from 'hono';
import type {AwardDetail, PersonAwardDetail} from '@shine/types';
import {AwardsService} from '../services';
import {paginateAwardDetail} from '../services/awards-service';
import {
  shouldCheckETag,
  createCachedResponse,
  createETag,
  EdgeCache,
} from '../utils/cache';

export const awardsRoutes = new Hono<{Bindings: Environment}>();

const AWARDS_CACHE_TTL = 604_800;

awardsRoutes.get('/', async c => {
  const cache = new EdgeCache(undefined, c.env.CACHE_KV);
  const cacheKey = 'awards:list:v19';
  const cached = await cache.get(cacheKey);
  const result = (cached?.data as {awards: unknown[]} | undefined) ?? {
    awards: await new AwardsService(c.env).listAwards(),
  };

  if (!cached) {
    await cache.set(cacheKey, result, AWARDS_CACHE_TTL);
  }

  const etag = createETag(result);
  if (shouldCheckETag(c.req, etag)) {
    return new Response(undefined, {status: 304, headers: {ETag: etag}});
  }

  return createCachedResponse(result, AWARDS_CACHE_TTL, {ETag: etag, 'X-Cache-Status': cached ? 'HIT' : 'MISS'});
});

awardsRoutes.get('/:slug', async c => {
  const cache = new EdgeCache(undefined, c.env.CACHE_KV);
  const slug = c.req.param('slug');
  const pageParameter = Number(c.req.query('page') ?? '1');
  const page =
    Number.isSafeInteger(pageParameter) && pageParameter > 0
      ? pageParameter
      : 1;

  // ページはキャッシュキーに含めない。利用者入力でキー空間が広がるのを避けるため、
  // 全件を1キーに載せて読み出し後に切り出す
  const cacheKey = `awards:${slug}:v4`;
  const cached = await cache.get(cacheKey);
  const service = new AwardsService(c.env);
  const full =
    (cached?.data as AwardDetail | PersonAwardDetail | undefined) ??
    (await service.getAwardBySlug(slug)) ??
    (await service.getPersonAwardBySlug(slug));

  if (!full) {
    return c.json({error: 'Award not found'}, 404);
  }

  if (!cached) {
    await cache.set(cacheKey, full, AWARDS_CACHE_TTL);
  }

  const award =
    full.grouping === 'person' ? full : paginateAwardDetail(full, page);
  if (!award) {
    return c.json({error: 'Award not found'}, 404);
  }

  const etag = createETag(award);
  if (shouldCheckETag(c.req, etag)) {
    return new Response(undefined, {status: 304, headers: {ETag: etag}});
  }

  return createCachedResponse(award, AWARDS_CACHE_TTL, {ETag: etag, 'X-Cache-Status': cached ? 'HIT' : 'MISS'});
});

awardsRoutes.get('/:slug/:year', async c => {
  const cache = new EdgeCache(undefined, c.env.CACHE_KV);
  const year = Number(c.req.param('year'));
  if (!Number.isSafeInteger(year)) {
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
  if (shouldCheckETag(c.req, etag)) {
    return new Response(undefined, {status: 304, headers: {ETag: etag}});
  }

  return createCachedResponse(award, AWARDS_CACHE_TTL, {ETag: etag, 'X-Cache-Status': cached ? 'HIT' : 'MISS'});
});
