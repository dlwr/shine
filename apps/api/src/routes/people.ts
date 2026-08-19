import type {Environment} from '@shine/database';
import {Hono} from 'hono';
import {PeopleService} from '../services/people-service';
import {
  createCachedResponse,
  createETag,
  EdgeCache,
  getCacheKeyForPerson,
  normalizeCacheLocale,
  shouldCheckETag,
} from '../utils/cache';

export const peopleRoutes = new Hono<{Bindings: Environment}>();

const PERSON_CACHE_TTL = 86_400;

peopleRoutes.get('/:id', async c => {
  const personUid = c.req.param('id');
  const locale = c.req.query('locale') === 'en' ? 'en' : 'ja';
  const cacheLocale = normalizeCacheLocale(locale) ?? 'ja';
  const cacheKey = getCacheKeyForPerson(personUid, cacheLocale);

  const cache = new EdgeCache(undefined, c.env.CACHE_KV);
  const cached = await cache.get(cacheKey);

  if (cached?.data) {
    return c.json(cached.data as Record<string, unknown>);
  }

  const person = await new PeopleService(c.env).getPerson(personUid, locale);

  if (!person) {
    return c.json({error: 'Person not found'}, 404);
  }

  await cache.set(cacheKey, person, PERSON_CACHE_TTL);

  const etag = createETag(person);
  if (shouldCheckETag(c.req, etag)) {
    return new Response(undefined, {status: 304, headers: {ETag: etag}});
  }

  return createCachedResponse(person, PERSON_CACHE_TTL, {ETag: etag});
});
