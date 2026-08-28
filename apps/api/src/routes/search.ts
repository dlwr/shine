import type {Environment} from '@shine/database';
import type {SearchSuggestions} from '@shine/types';
import {Hono} from 'hono';
import {sanitizeText} from '../middleware/sanitizer';
import {MoviesService} from '../services/movies-service';
import {PeopleService} from '../services/people-service';
import {
  createCachedResponse,
  createETag,
  EdgeCache,
  shouldCheckETag,
} from '../utils/cache';

export const searchRoutes = new Hono<{Bindings: Environment}>();

const SUGGEST_CACHE_TTL = 86_400;
const SUGGEST_LIMIT = 5;
const SUGGEST_QUERY_MIN_LENGTH = 2;
const SUGGEST_QUERY_MAX_LENGTH = 50;

const EMPTY_SUGGESTIONS: SearchSuggestions = {movies: [], people: []};

function normalizeQuery(value: string | undefined): string {
  return sanitizeText(value ?? '')
    .replaceAll(/\s+/g, ' ')
    .slice(0, SUGGEST_QUERY_MAX_LENGTH);
}

async function suggest(
  environment: Environment,
  query: string,
  locale: string,
): Promise<SearchSuggestions> {
  const [movies, people] = await Promise.all([
    new MoviesService(environment).searchMovies({
      page: 1,
      limit: SUGGEST_LIMIT,
      query,
    }),
    new PeopleService(environment).searchPeople({
      query,
      locale,
      limit: SUGGEST_LIMIT,
    }),
  ]);

  return {
    movies: movies.movies.map(movie => ({
      uid: movie.uid,
      title: movie.title,
      year: movie.year,
    })),
    people,
  };
}

searchRoutes.get('/suggest', async c => {
  const query = normalizeQuery(c.req.query('q'));
  if (query.length < SUGGEST_QUERY_MIN_LENGTH) {
    return c.json(EMPTY_SUGGESTIONS);
  }

  const locale = c.req.query('locale') === 'en' ? 'en' : 'ja';
  const cache = new EdgeCache(undefined, c.env.CACHE_KV);
  const cacheKey = `search:suggest:${locale}:${query}:v1`;
  const cached = await cache.get(cacheKey);
  const result =
    (cached?.data as SearchSuggestions | undefined) ??
    (await suggest(c.env, query, locale));

  if (!cached) {
    await cache.set(cacheKey, result, SUGGEST_CACHE_TTL);
  }

  const etag = createETag(result);
  if (shouldCheckETag(c.req, etag)) {
    return new Response(undefined, {status: 304, headers: {ETag: etag}});
  }

  return createCachedResponse(result, SUGGEST_CACHE_TTL, {ETag: etag});
});
