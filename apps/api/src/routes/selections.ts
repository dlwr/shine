import {getDatabase, type Environment} from '@shine/database';
import {Hono} from 'hono';
import {SelectionsService} from '../services';
import {getSelectionDate, isSelectionType} from '../services/selection-dates';
import {
  HISTORY_MAX_LIMIT,
  loadSelectionHistory,
  type SelectionHistoryItem,
} from '../services/selection-history';
import {parseAcceptLanguage} from '../utils/accept-language';
import {
  createCachedResponse,
  createETag,
  EdgeCache,
  getCacheKeyForSelectionHistory,
  getCacheTTL,
  IMPORTED_DATA_EDGE_TTL,
  shouldCheckETag,
  writeCacheAfterResponse,
} from '../utils/cache';

export const selectionsRoutes = new Hono<{Bindings: Environment}>();

selectionsRoutes.get('/', async c => {
  try {
    const cache = new EdgeCache(undefined, c.env.CACHE_KV);
    const selectionsService = new SelectionsService(c.env, cache);
    const localeParameter = c.req.query('locale');
    const acceptLanguage = c.req.header('accept-language');
    const preferredLanguages = localeParameter
      ? [localeParameter]
      : parseAcceptLanguage(acceptLanguage);
    const locale =
      preferredLanguages.find(lang => ['en', 'ja'].includes(lang)) || 'en';

    const result = await selectionsService.getDateSeededSelections({
      locale,
      date: new Date(),
    });

    const etag = createETag(result);

    if (shouldCheckETag(c.req, etag)) {
      return c.newResponse('', 304, {
        ETag: etag,
        'Cache-Control': 'public, max-age=3600',
      });
    }

    const ttl = getCacheTTL.selections.daily;
    const {hits, misses} = cache.getMetrics();
    let cacheStatus = 'PARTIAL';
    if (misses === 0 && hits > 0) {
      cacheStatus = 'HIT';
    } else if (hits === 0) {
      cacheStatus = 'MISS';
    }

    return createCachedResponse(result, ttl, {
      ETag: etag,
      'X-Cache-Status': cacheStatus,
    });
  } catch (error) {
    console.error('Error fetching feature movies:', error);
    return c.json({error: 'Internal server error'}, 500);
  }
});

selectionsRoutes.get('/selections/:type/next', async c => {
  try {
    const type = c.req.param('type');
    if (!isSelectionType(type)) {
      return c.json({error: 'Invalid selection type'}, 400);
    }

    const locale = c.req.query('locale') === 'en' ? 'en' : 'ja';
    const cache = new EdgeCache(undefined, c.env.CACHE_KV);
    const preview = await new SelectionsService(c.env, cache).getNextSelection(
      type,
      locale,
    );

    const {hits} = cache.getMetrics();
    return createCachedResponse(preview, getCacheTTL.selections[type], {
      'X-Cache-Status': hits > 0 ? 'HIT' : 'MISS',
    });
  } catch (error) {
    console.error('Error fetching next selection:', error);
    return c.json({error: 'Internal server error'}, 500);
  }
});

selectionsRoutes.get('/selections/:type/history', async c => {
  try {
    const type = c.req.param('type');
    if (!isSelectionType(type)) {
      return c.json({error: 'Invalid selection type'}, 400);
    }

    const locale = c.req.query('locale') === 'en' ? 'en' : 'ja';
    const limitParameter = Number(c.req.query('limit') ?? '14');
    const limit =
      Number.isSafeInteger(limitParameter) && limitParameter > 0
        ? Math.min(limitParameter, HISTORY_MAX_LIMIT)
        : 14;
    const today = getSelectionDate(new Date(), type);

    const historyCache = new EdgeCache(undefined, c.env.CACHE_KV);
    const cacheKey = getCacheKeyForSelectionHistory(type, today, locale);
    const cached = await historyCache.get(cacheKey, {
      edgeTtl: IMPORTED_DATA_EDGE_TTL,
    });
    if (cached) {
      const {items} = cached.data as {items: SelectionHistoryItem[]};
      return c.json({items: items.slice(0, limit)}, 200, {
        'X-Cache-Status': 'HIT',
      });
    }

    const items = await loadSelectionHistory(
      getDatabase(c.env),
      type,
      today,
      locale,
    );

    await writeCacheAfterResponse(
      c,
      historyCache.set(cacheKey, {items}, getCacheTTL.selections.history),
    );

    return createCachedResponse(
      {items: items.slice(0, limit)},
      getCacheTTL.selections[type],
      {'X-Cache-Status': 'MISS'},
    );
  } catch (error) {
    console.error('Error fetching selection history:', error);
    return c.json({error: 'Internal server error'}, 500);
  }
});
