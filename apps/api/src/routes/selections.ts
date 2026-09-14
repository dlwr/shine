import {
  and,
  eq,
  getDatabase,
  isNull,
  sql,
  type Environment,
} from '@shine/database';
import {movieSelections} from '@shine/database/schema/movie-selections';
import {movies} from '@shine/database/schema/movies';
import {Hono} from 'hono';
import {authMiddleware} from '../auth';
import {SelectionsService} from '../services';
import {getSelectionDate} from '../services/selection-dates';
import {loadSelectionMovie} from '../services/selection-movie';
import {pickNominatedMovieUid} from '../services/selection-pick';
import {
  createCachedResponse,
  createETag,
  EdgeCache,
  getCacheTTL,
  IMPORTED_DATA_EDGE_TTL,
  shouldCheckETag,
  writeCacheAfterResponse,
} from '../utils/cache';

export const selectionsRoutes = new Hono<{Bindings: Environment}>();

function sortLanguagesByQuality(
  languages: Array<{code: string; quality: number}>,
) {
  const sorted: Array<{code: string; quality: number}> = [];
  for (const language of languages) {
    const insertIndex = sorted.findIndex(
      current => current.quality < language.quality,
    );
    if (insertIndex === -1) {
      sorted.push(language);
    } else {
      sorted.splice(insertIndex, 0, language);
    }
  }
  return sorted;
}

function parseAcceptLanguage(acceptLanguage?: string): string[] {
  if (!acceptLanguage) {
    return [];
  }

  const languages = acceptLanguage.split(',').map(entry => {
    const [code, quality] = entry.trim().split(';q=', 2);
    return {
      code: code.split('-', 1)[0],
      quality: quality ? Number(quality) : 1,
    };
  });
  const sortedLanguages = sortLanguagesByQuality(languages);
  return sortedLanguages.map(language => language.code);
}

// Main endpoint for date-seeded movie selections
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

    // Create ETag for the response
    const etag = createETag(result);

    // Check if client has the same version
    if (shouldCheckETag(c.req, etag)) {
      return c.newResponse('', 304, {
        ETag: etag,
        'Cache-Control': 'public, max-age=3600',
      });
    }

    // Determine TTL based on the shortest period (daily)
    const ttl = getCacheTTL.selections.daily;
    const {hits, misses} = cache.getMetrics();
    let cacheStatus = 'PARTIAL';
    if (misses === 0 && hits > 0) {
      cacheStatus = 'HIT';
    } else if (hits === 0) {
      cacheStatus = 'MISS';
    }

    // Create cached response with appropriate headers
    const response = createCachedResponse(result, ttl, {
      ETag: etag,
      'X-Cache-Status': cacheStatus,
    });

    return response;
  } catch (error) {
    console.error('Error fetching feature movies:', error);
    return c.json({error: 'Internal server error'}, 500);
  }
});

// Public: recent selections per type (for archive pages, RSS feed etc.)
selectionsRoutes.get('/selections/:type/history', async c => {
  try {
    const type = c.req.param('type');
    if (type !== 'daily' && type !== 'weekly' && type !== 'monthly') {
      return c.json({error: 'Invalid selection type'}, 400);
    }

    const database = getDatabase(c.env);
    const locale = c.req.query('locale') === 'en' ? 'en' : 'ja';
    const limitParameter = Number(c.req.query('limit') ?? '14');
    const limit =
      Number.isSafeInteger(limitParameter) && limitParameter > 0
        ? Math.min(limitParameter, 30)
        : 14;
    const today = getSelectionDate(new Date(), type);

    const historyCache = new EdgeCache(undefined, c.env.CACHE_KV);
    const cacheKey = `selections:history:${type}:${locale}:${limit}:${today}:v2`;
    const cached = await historyCache.get(cacheKey, {
      edgeTtl: IMPORTED_DATA_EDGE_TTL,
    });
    if (cached) {
      return c.json(cached.data as Record<string, unknown>, 200, {
        'X-Cache-Status': 'HIT',
      });
    }

    const rows = await database
      .select({
        uid: movies.uid,
        year: movies.year,
        selectionDate: movieSelections.selectionDate,
        localeTitle: sql<string | undefined>`(
          SELECT content FROM translations
          WHERE resource_type = 'movie_title'
            AND resource_uid = ${movies.uid}
            AND language_code = ${locale}
          LIMIT 1
        )`,
        defaultTitle: sql<string | undefined>`(
          SELECT content FROM translations
          WHERE resource_type = 'movie_title'
            AND resource_uid = ${movies.uid}
            AND is_default = 1
          LIMIT 1
        )`,
      })
      .from(movieSelections)
      .innerJoin(movies, eq(movieSelections.movieId, movies.uid))
      .where(
        and(
          eq(movieSelections.selectionType, type),
          sql`${movieSelections.selectionDate} <= ${today}`,
          isNull(movies.deletedAt),
        ),
      )
      .orderBy(sql`${movieSelections.selectionDate} DESC`)
      .limit(limit);

    const items = rows.map(row => ({
      uid: row.uid,
      title: row.localeTitle ?? row.defaultTitle ?? 'Unknown Title',
      year: row.year ?? undefined,
      selectionDate: row.selectionDate,
    }));

    await writeCacheAfterResponse(
      c,
      historyCache.set(cacheKey, {items}, getCacheTTL.selections[type]),
    );

    return createCachedResponse({items}, getCacheTTL.selections[type], {
      'X-Cache-Status': 'MISS',
    });
  } catch (error) {
    console.error('Error fetching selection history:', error);
    return c.json({error: 'Internal server error'}, 500);
  }
});

// Admin: Reselect movie for a specific period
selectionsRoutes.post('/reselect', authMiddleware, async c => {
  try {
    const selectionsService = new SelectionsService(c.env);
    const body = await c.req.json();
    const {type, locale = 'en', excludeMovieUids = [], date} = body;

    if (!type || !['daily', 'weekly', 'monthly'].includes(type)) {
      return c.json({error: 'Invalid selection type'}, 400);
    }

    if (
      !Array.isArray(excludeMovieUids) ||
      excludeMovieUids.some(uid => typeof uid !== 'string')
    ) {
      return c.json({error: 'Invalid excludeMovieUids'}, 400);
    }

    if (date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
      return c.json({error: 'Date must be in YYYY-MM-DD format'}, 400);
    }

    const targetDate = date
      ? new Date(`${String(date)}T00:00:00.000Z`)
      : new Date();

    const movie = await selectionsService.reselectMovie(
      type,
      locale,
      targetDate,
      excludeMovieUids,
    );

    return c.json({
      type,
      movie,
    });
  } catch (error) {
    console.error('Error reselecting movie:', error);
    return c.json({error: 'Internal server error'}, 500);
  }
});

// Admin: Preview next period movie selections
selectionsRoutes.get('/admin/preview-selections', authMiddleware, async c => {
  try {
    const selectionsService = new SelectionsService(c.env);
    const localeParameter = c.req.query('locale');
    const locale = localeParameter || 'en';

    const previews = await selectionsService.getNextPeriodPreviews(locale);

    return c.json(previews);
  } catch (error) {
    console.error('Error previewing next selections:', error);
    return c.json({error: 'Internal server error'}, 500);
  }
});

// Admin: Clean up future movie selections
selectionsRoutes.delete(
  '/admin/cleanup-future-selections',
  authMiddleware,
  async c => {
    try {
      const database = getDatabase(c.env);
      const now = new Date();

      const currentDates = {
        daily: getSelectionDate(now, 'daily'),
        weekly: getSelectionDate(now, 'weekly'),
        monthly: getSelectionDate(now, 'monthly'),
      };

      // Delete selections that are in the future
      const deletedDaily = await database
        .delete(movieSelections)
        .where(
          and(
            eq(movieSelections.selectionType, 'daily'),
            sql`${movieSelections.selectionDate} > ${currentDates.daily}`,
          ),
        );

      const deletedWeekly = await database
        .delete(movieSelections)
        .where(
          and(
            eq(movieSelections.selectionType, 'weekly'),
            sql`${movieSelections.selectionDate} > ${currentDates.weekly}`,
          ),
        );

      const deletedMonthly = await database
        .delete(movieSelections)
        .where(
          and(
            eq(movieSelections.selectionType, 'monthly'),
            sql`${movieSelections.selectionDate} > ${currentDates.monthly}`,
          ),
        );

      return c.json({
        success: true,
        currentDates,
        deletedCount: {
          daily: deletedDaily.rowsAffected || 0,
          weekly: deletedWeekly.rowsAffected || 0,
          monthly: deletedMonthly.rowsAffected || 0,
        },
      });
    } catch (error) {
      console.error('Error cleaning up future selections:', error);
      return c.json({error: 'Internal server error'}, 500);
    }
  },
);

selectionsRoutes.post(
  '/admin/random-movie-preview',
  authMiddleware,
  async c => {
    try {
      const database = getDatabase(c.env);
      const {locale = 'en'} = await c.req.json<{locale?: string}>();

      const movieUid = await pickNominatedMovieUid(database, 'random');
      if (!movieUid) {
        return c.json({error: 'No nominations found'}, 404);
      }

      return c.json(await loadSelectionMovie(database, movieUid, locale));
    } catch (error) {
      console.error('Error generating random movie preview:', error);
      return c.json({error: 'Internal server error'}, 500);
    }
  },
);

// Admin: Override movie selection for specific date/type
selectionsRoutes.post('/admin/override-selection', authMiddleware, async c => {
  try {
    const selectionsService = new SelectionsService(c.env);
    const {type, date, movieId} = await c.req.json();

    // Validate inputs
    if (!type || !['daily', 'weekly', 'monthly'].includes(type)) {
      return c.json({error: 'Invalid selection type'}, 400);
    }

    if (!date) {
      return c.json({error: 'Date is required'}, 400);
    }

    if (!movieId) {
      return c.json({error: 'Movie ID is required'}, 400);
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return c.json({error: 'Date must be in YYYY-MM-DD format'}, 400);
    }

    const targetDate = new Date(String(date) + 'T00:00:00.000Z');
    await selectionsService.overrideSelection(type, movieId, targetDate);

    return c.json({
      success: true,
    });
  } catch (error) {
    console.error('Error overriding selection:', error);

    if (error instanceof Error && error.message === 'Movie not found') {
      return c.json({error: 'Movie not found'}, 404);
    }

    return c.json({error: 'Internal server error'}, 500);
  }
});
