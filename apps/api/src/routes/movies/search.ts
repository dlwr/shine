import {type Environment} from '@shine/database';
import {Hono} from 'hono';
import {sanitizeText} from '../../middleware/sanitizer';
import {MoviesService} from '../../services';
import {
  EdgeCache,
  getCacheKeyForSearch,
  getCacheTTL,
  writeCacheAfterResponse,
} from '../../utils/cache';
import {parsePagination} from '../../utils/pagination';

export const movieSearchRoutes = new Hono<{Bindings: Environment}>();

// Search movies endpoint
movieSearchRoutes.get('/search', async c => {
  try {
    const moviesService = new MoviesService(c.env);
    const {page, limit} = parsePagination(c);
    const rawQuery = c.req.query('q');
    const yearFilter = c.req.query('year');
    const languageFilter = c.req.query('language');
    const hasAwardsFilter = c.req.query('hasAwards');

    const query = rawQuery ? sanitizeText(rawQuery) : undefined;

    let hasAwards: boolean | undefined;
    if (hasAwardsFilter === 'true') {
      hasAwards = true;
    } else if (hasAwardsFilter === 'false') {
      hasAwards = false;
    } else {
      hasAwards = undefined;
    }

    const filters = {
      query,
      year: yearFilter ? Number(yearFilter) : undefined,
      language: languageFilter,
      hasAwards,
    };

    const cache = new EdgeCache(undefined, c.env.CACHE_KV);
    const cacheKey = getCacheKeyForSearch(query ?? '', page, limit, filters);
    const cached = await cache.get(cacheKey);

    if (cached?.data) {
      return c.json(cached.data as Record<string, unknown>, 200, {
        'X-Cache-Status': 'HIT',
      });
    }

    const result = await moviesService.searchMovies({
      page,
      limit,
      query,
      year: filters.year,
      language: languageFilter,
      hasAwards,
    });

    const body = {
      movies: result.movies,
      pagination: {
        currentPage: result.pagination.currentPage,
        totalPages: result.pagination.totalPages,
        totalCount: result.pagination.totalCount,
        hasNextPage: result.pagination.hasNext,
        hasPrevPage: result.pagination.hasPrev,
      },
      filters,
    };

    await writeCacheAfterResponse(
      c,
      cache.set(cacheKey, body, getCacheTTL.search.results),
    );

    return c.json(body, 200, {'X-Cache-Status': 'MISS'});
  } catch (error) {
    console.error('Error searching movies:', error);
    return c.json({error: 'Internal server error'}, 500);
  }
});
