import type {Environment} from '@shine/database';
import type {PeopleSearchResult} from '../types/people';
import {Hono} from 'hono';
import {sanitizeText} from '../middleware/sanitizer';
import {PeopleService} from '../services/people-service';
import {PersonCrossingsService} from '../services/person-crossings-service';
import {PersonUncrownedService} from '../services/person-uncrowned-service';
import {isUid} from '../utils/uid';
import {
  createCachedResponse,
  createETag,
  EdgeCache,
  getCacheKeyForPerson,
  IMPORTED_DATA_EDGE_TTL,
  normalizeCacheLocale,
  shouldCheckETag,
  writeCacheAfterResponse,
} from '../utils/cache';
import {readThroughCache} from '../utils/read-through-cache';

export const peopleRoutes = new Hono<{Bindings: Environment}>();

const PERSON_CACHE_TTL = 604_800;
const PEOPLE_LIST_CACHE_TTL = 604_800;
const PROMINENT_CACHE_TTL = 604_800;
const PERSON_CROSSINGS_CACHE_TTL = 604_800;
const PERSON_UNCROWNED_CACHE_TTL = 604_800;
const PEOPLE_SEARCH_CACHE_TTL = 86_400;
const PEOPLE_LIST_DEFAULT_LIMIT = 100;
const PEOPLE_LIST_MAX_LIMIT = 500;
const PROMINENT_DEFAULT_LIMIT = 24;
const PROMINENT_MAX_LIMIT = 200;
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
  const {data: result, status} = await readThroughCache(c, cache, {
    key: `people:list:${page}:${limit}:v2`,
    ttl: PEOPLE_LIST_CACHE_TTL,
    edgeTtl: IMPORTED_DATA_EDGE_TTL,
    load: async () => new PeopleService(c.env).listPeople({page, limit}),
  });

  const etag = createETag(result);
  if (shouldCheckETag(c.req, etag)) {
    return new Response(undefined, {status: 304, headers: {ETag: etag}});
  }

  return createCachedResponse(result, PEOPLE_LIST_CACHE_TTL, {
    ETag: etag,
    'X-Cache-Status': status,
  });
});

peopleRoutes.get('/prominent', async c => {
  const locale = c.req.query('locale') === 'en' ? 'en' : 'ja';
  const requestedLimit = parsePositiveInteger(
    c.req.query('limit'),
    PROMINENT_DEFAULT_LIMIT,
  );

  if (requestedLimit === undefined) {
    return c.json({error: 'limit must be a positive integer'}, 400);
  }

  const limit = Math.min(requestedLimit, PROMINENT_MAX_LIMIT);
  const cache = new EdgeCache(undefined, c.env.CACHE_KV);
  const {data: result, status} = await readThroughCache(c, cache, {
    key: `people:prominent:${locale}:${limit}:v13`,
    ttl: PROMINENT_CACHE_TTL,
    edgeTtl: IMPORTED_DATA_EDGE_TTL,
    load: async () =>
      new PeopleService(c.env).getProminentPeople({locale, limit}),
  });

  const etag = createETag(result);
  if (shouldCheckETag(c.req, etag)) {
    return new Response(undefined, {status: 304, headers: {ETag: etag}});
  }

  return createCachedResponse(result, PROMINENT_CACHE_TTL, {
    ETag: etag,
    'X-Cache-Status': status,
  });
});

peopleRoutes.get('/search', async c => {
  const query = normalizeSearchQuery(c.req.query('q'));
  if (!query) {
    return c.json({error: 'q is required'}, 400);
  }

  const locale = c.req.query('locale') === 'en' ? 'en' : 'ja';
  const cache = new EdgeCache(undefined, c.env.CACHE_KV);
  const cacheKey = `people:search:${locale}:${query}:v1`;
  const cached = await cache.get(cacheKey, {edgeTtl: IMPORTED_DATA_EDGE_TTL});
  const result =
    cached?.data ??
    ({
      people: await new PeopleService(c.env).searchPeople({query, locale}),
    } satisfies PeopleSearchResult);

  if (!cached) {
    await writeCacheAfterResponse(
      c,
      cache.set(cacheKey, result, PEOPLE_SEARCH_CACHE_TTL),
    );
  }

  const etag = createETag(result);
  if (shouldCheckETag(c.req, etag)) {
    return new Response(undefined, {status: 304, headers: {ETag: etag}});
  }

  return createCachedResponse(result, PEOPLE_SEARCH_CACHE_TTL, {
    ETag: etag,
    'X-Cache-Status': cached ? 'HIT' : 'MISS',
  });
});

peopleRoutes.get('/crossings', async c => {
  const locale = c.req.query('locale') === 'en' ? 'en' : 'ja';
  const cache = new EdgeCache(undefined, c.env.CACHE_KV);
  const {data: result, status} = await readThroughCache(c, cache, {
    key: `people:crossings:${locale}:v5`,
    ttl: PERSON_CROSSINGS_CACHE_TTL,
    edgeTtl: IMPORTED_DATA_EDGE_TTL,
    load: async () =>
      new PersonCrossingsService(c.env).getPersonCrossings({locale}),
  });

  const etag = createETag(result);
  if (shouldCheckETag(c.req, etag)) {
    return new Response(undefined, {status: 304, headers: {ETag: etag}});
  }

  return createCachedResponse(result, PERSON_CROSSINGS_CACHE_TTL, {
    ETag: etag,
    'X-Cache-Status': status,
  });
});

peopleRoutes.get('/uncrowned', async c => {
  const locale = c.req.query('locale') === 'en' ? 'en' : 'ja';
  const cache = new EdgeCache(undefined, c.env.CACHE_KV);
  const {data: result} = await readThroughCache(c, cache, {
    key: `people:uncrowned:${locale}:v3`,
    ttl: PERSON_UNCROWNED_CACHE_TTL,
    edgeTtl: IMPORTED_DATA_EDGE_TTL,
    load: async () =>
      new PersonUncrownedService(c.env).getPersonUncrowned({locale}),
  });

  const etag = createETag(result);
  if (shouldCheckETag(c.req, etag)) {
    return new Response(undefined, {status: 304, headers: {ETag: etag}});
  }

  return createCachedResponse(result, PERSON_UNCROWNED_CACHE_TTL, {
    ETag: etag,
  });
});

peopleRoutes.get('/:id', async c => {
  const personUid = c.req.param('id');
  if (!isUid(personUid)) {
    return c.json({error: 'Person not found'}, 404);
  }

  const locale = c.req.query('locale') === 'en' ? 'en' : 'ja';
  const cacheLocale = normalizeCacheLocale(locale) ?? 'ja';
  const cacheKey = getCacheKeyForPerson(personUid, cacheLocale);

  const cache = new EdgeCache(undefined, c.env.CACHE_KV);
  const {data: person, status} = await readThroughCache(c, cache, {
    key: cacheKey,
    ttl: PERSON_CACHE_TTL,
    edgeTtl: IMPORTED_DATA_EDGE_TTL,
    load: async () => new PeopleService(c.env).getPerson(personUid, locale),
  });

  if (!person) {
    return c.json({error: 'Person not found'}, 404);
  }

  if (status !== 'MISS') {
    return c.json(person as Record<string, unknown>, 200, {
      'X-Cache-Status': status,
    });
  }

  const etag = createETag(person);
  if (shouldCheckETag(c.req, etag)) {
    return new Response(undefined, {status: 304, headers: {ETag: etag}});
  }

  return createCachedResponse(person, PERSON_CACHE_TTL, {
    ETag: etag,
    'X-Cache-Status': status,
  });
});
