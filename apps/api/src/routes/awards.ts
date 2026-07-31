import type {Environment} from '@shine/database';
import {Hono} from 'hono';
import {AwardsService} from '../services';
import {checkETag, createCachedResponse, createETag} from '../utils/cache';

export const awardsRoutes = new Hono<{Bindings: Environment}>();

const AWARDS_CACHE_TTL = 21_600;

awardsRoutes.get('/', async c => {
  const service = new AwardsService(c.env);
  const awards = await service.listAwards();
  const result = {awards};

  const etag = createETag(result);
  if (checkETag(c.req, etag)) {
    return new Response(undefined, {status: 304, headers: {ETag: etag}});
  }

  return createCachedResponse(result, AWARDS_CACHE_TTL, {ETag: etag});
});

awardsRoutes.get('/:slug', async c => {
  const service = new AwardsService(c.env);
  const award = await service.getAwardBySlug(c.req.param('slug'));

  if (!award) {
    return c.json({error: 'Award not found'}, 404);
  }

  const etag = createETag(award);
  if (checkETag(c.req, etag)) {
    return new Response(undefined, {status: 304, headers: {ETag: etag}});
  }

  return createCachedResponse(award, AWARDS_CACHE_TTL, {ETag: etag});
});
