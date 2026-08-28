import type {Environment} from '@shine/database';
import type {PeopleSearchResult} from '@shine/types';
import {Hono} from 'hono';
import {sanitizeText} from '../middleware/sanitizer';
import {PeopleService} from '../services/people-service';
import {PersonCrossingsService} from '../services/person-crossings-service';
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
const PEOPLE_LIST_CACHE_TTL = 604_800;
const PROMINENT_CACHE_TTL = 604_800;
const PERSON_CROSSINGS_CACHE_TTL = 604_800;
const PEOPLE_SEARCH_CACHE_TTL = 86_400;
const PEOPLE_LIST_DEFAULT_LIMIT = 100;
const PEOPLE_LIST_MAX_LIMIT = 500;
const PEOPLE_SEARCH_QUERY_MAX_LENGTH = 100;

function normalizeSearchQuery(value: string | undefined): string {
  return sanitizeText(value ?? '')
    .replaceAll(/\s+/g, ' ')
    .slice(0, PEOPLE_SEARCH_QUERY_MAX_LENGTH);
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
): number | undefined {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

peopleRoutes.get('/', async c => {
  const page = parsePositiveInteger(c.req.query('page'), 1);
  const requestedLimit = parsePositiveInteger(
    c.req.query('limit'),
    PEOPLE_LIST_DEFAULT_LIMIT,
  );

  if (page === undefined || requestedLimit === undefined) {
    return c.json({error: 'page and limit must be positive integers'}, 400);
  }

  const limit = Math.min(requestedLimit, PEOPLE_LIST_MAX_LIMIT);
  const cache = new EdgeCache(undefined, c.env.CACHE_KV);
  const cacheKey = `people:list:${page}:${limit}:v1`;
  const cached = await cache.get(cacheKey);
  const result =
    cached?.data ?? (await new PeopleService(c.env).listPeople({page, limit}));

  if (!cached) {
    await cache.set(cacheKey, result, PEOPLE_LIST_CACHE_TTL);
  }

  const etag = createETag(result);
  if (shouldCheckETag(c.req, etag)) {
    return new Response(undefined, {status: 304, headers: {ETag: etag}});
  }

  return createCachedResponse(result, PEOPLE_LIST_CACHE_TTL, {ETag: etag});
});

peopleRoutes.get('/prominent', async c => {
  const locale = c.req.query('locale') === 'en' ? 'en' : 'ja';
  const cache = new EdgeCache(undefined, c.env.CACHE_KV);
  const cacheKey = `people:prominent:${locale}:v9`;
  const cached = await cache.get(cacheKey);
  const result =
    cached?.data ??
    (await new PeopleService(c.env).getProminentPeople({locale}));

  if (!cached) {
    await cache.set(cacheKey, result, PROMINENT_CACHE_TTL);
  }

  const etag = createETag(result);
  if (shouldCheckETag(c.req, etag)) {
    return new Response(undefined, {status: 304, headers: {ETag: etag}});
  }

  return createCachedResponse(result, PROMINENT_CACHE_TTL, {ETag: etag});
});

peopleRoutes.get('/search', async c => {
  const query = normalizeSearchQuery(c.req.query('q'));
  if (!query) {
    return c.json({error: 'q is required'}, 400);
  }

  const locale = c.req.query('locale') === 'en' ? 'en' : 'ja';
  const cache = new EdgeCache(undefined, c.env.CACHE_KV);
  const cacheKey = `people:search:${locale}:${query}:v1`;
  const cached = await cache.get(cacheKey);
  const result =
    cached?.data ??
    ({
      people: await new PeopleService(c.env).searchPeople({query, locale}),
    } satisfies PeopleSearchResult);

  if (!cached) {
    await cache.set(cacheKey, result, PEOPLE_SEARCH_CACHE_TTL);
  }

  const etag = createETag(result);
  if (shouldCheckETag(c.req, etag)) {
    return new Response(undefined, {status: 304, headers: {ETag: etag}});
  }

  return createCachedResponse(result, PEOPLE_SEARCH_CACHE_TTL, {ETag: etag});
});

peopleRoutes.get('/crossings', async c => {
  const locale = c.req.query('locale') === 'en' ? 'en' : 'ja';
  const cache = new EdgeCache(undefined, c.env.CACHE_KV);
  const cacheKey = `people:crossings:${locale}:v1`;
  const cached = await cache.get(cacheKey);
  const result =
    cached?.data ??
    (await new PersonCrossingsService(c.env).getPersonCrossings({locale}));

  if (!cached) {
    await cache.set(cacheKey, result, PERSON_CROSSINGS_CACHE_TTL);
  }

  const etag = createETag(result);
  if (shouldCheckETag(c.req, etag)) {
    return new Response(undefined, {status: 304, headers: {ETag: etag}});
  }

  return createCachedResponse(result, PERSON_CROSSINGS_CACHE_TTL, {
    ETag: etag,
  });
});

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
