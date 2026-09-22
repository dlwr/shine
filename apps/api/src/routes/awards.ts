import type {Environment} from '@shine/database';
import {Hono} from 'hono';
import type {AwardDetail, PersonAwardDetail} from '../types/awards';
import type {AwardsListResponse} from '../types/responses';
import {AwardsService, PersonAwardsService} from '../services';
import {paginateAwardDetail} from '../services/award-page-ordering';
import {
  createCachedResponse,
  createETag,
  EdgeCache,
  IMPORTED_DATA_EDGE_TTL,
  shouldCheckETag,
} from '../utils/cache';
import {readThroughCache} from '../utils/read-through-cache';

export const awardsRoutes = new Hono<{Bindings: Environment}>();

const AWARDS_CACHE_TTL = 604_800;

awardsRoutes.get('/', async c => {
  const cache = new EdgeCache(undefined, c.env.CACHE_KV);
  const {data: result, status} = await readThroughCache<AwardsListResponse>(
    c,
    cache,
    {
      key: 'awards:list:v20',
      ttl: AWARDS_CACHE_TTL,
      edgeTtl: IMPORTED_DATA_EDGE_TTL,
      load: async () => ({awards: await new AwardsService(c.env).listAwards()}),
    },
  );

  const etag = createETag(result);
  if (shouldCheckETag(c.req, etag)) {
    return new Response(undefined, {status: 304, headers: {ETag: etag}});
  }

  return createCachedResponse(result, AWARDS_CACHE_TTL, {
    ETag: etag,
    'X-Cache-Status': status,
  });
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
  const {data: full, status} = await readThroughCache<
    AwardDetail | PersonAwardDetail
  >(c, cache, {
    key: `awards:${slug}:v7`,
    ttl: AWARDS_CACHE_TTL,
    edgeTtl: IMPORTED_DATA_EDGE_TTL,
    load: async () =>
      (await new AwardsService(c.env).getAwardBySlug(slug)) ??
      (await new PersonAwardsService(c.env).getPersonAwardBySlug(slug)),
  });

  if (!full) {
    return c.json({error: 'Award not found'}, 404);
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

  return createCachedResponse(award, AWARDS_CACHE_TTL, {
    ETag: etag,
    'X-Cache-Status': status,
  });
});

awardsRoutes.get('/:slug/:year', async c => {
  const cache = new EdgeCache(undefined, c.env.CACHE_KV);
  const year = Number(c.req.param('year'));
  if (!Number.isSafeInteger(year)) {
    return c.json({error: 'Award not found'}, 404);
  }

  const slug = c.req.param('slug');
  const {data: award, status} = await readThroughCache(c, cache, {
    key: `awards:${slug}:${year}:v3`,
    ttl: AWARDS_CACHE_TTL,
    edgeTtl: IMPORTED_DATA_EDGE_TTL,
    load: async () => new AwardsService(c.env).getAwardYear(slug, year),
  });

  if (!award) {
    return c.json({error: 'Award not found'}, 404);
  }

  const etag = createETag(award);
  if (shouldCheckETag(c.req, etag)) {
    return new Response(undefined, {status: 304, headers: {ETag: etag}});
  }

  return createCachedResponse(award, AWARDS_CACHE_TTL, {
    ETag: etag,
    'X-Cache-Status': status,
  });
});
