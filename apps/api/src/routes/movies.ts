import {
  and,
  eq,
  getDatabase,
  inArray,
  isNull,
  sql,
  type Environment,
} from '@shine/database';
import {articleLinks} from '@shine/database/schema/article-links';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {Hono} from 'hono';
import {authMiddleware} from '../auth';
import {sanitizeText, sanitizeUrl} from '../middleware/sanitizer';
import {
  AvailabilityService,
  buildOnDemandRunners,
  MoviesService,
} from '../services';
import {invalidateMovieCaches} from '../services/movie-cache-invalidation';
import {
  shouldCheckETag,
  createCachedResponse,
  normalizeCacheLocale,
  createETag,
  EdgeCache,
  getCacheKeyForMovie,
  getCacheTTL,
} from '../utils/cache';
import {parsePagination} from '../utils/pagination';

export const moviesRoutes = new Hono<{Bindings: Environment}>();

const TURNSTILE_VERIFY_ENDPOINT =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';

type TurnstileVerificationResponse = {
  success: boolean;
  'error-codes'?: string[];
  challenge_ts?: string;
  hostname?: string;
  action?: string;
  cdata?: string;
};

async function verifyTurnstileToken(
  secretKey: string | undefined,
  token: string,
  remoteIp: string,
): Promise<TurnstileVerificationResponse> {
  if (!secretKey) {
    throw new Error('TURNSTILE_SECRET_KEY is not configured');
  }

  const formData = new FormData();
  formData.append('secret', secretKey);
  formData.append('response', token);

  if (remoteIp && remoteIp !== 'unknown') {
    formData.append('remoteip', remoteIp);
  }

  const response = await fetch(TURNSTILE_VERIFY_ENDPOINT, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(
      `Turnstile verification failed with status ${response.status}`,
    );
  }

  return (await response.json()) as TurnstileVerificationResponse;
}

// Search movies endpoint
moviesRoutes.get('/search', async c => {
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

    const result = await moviesService.searchMovies({
      page,
      limit,
      query,
      year: yearFilter ? Number(yearFilter) : undefined,
      language: languageFilter,
      hasAwards,
    });

    return c.json({
      movies: result.movies,
      pagination: {
        currentPage: result.pagination.currentPage,
        totalPages: result.pagination.totalPages,
        totalCount: result.pagination.totalCount,
        hasNextPage: result.pagination.hasNext,
        hasPrevPage: result.pagination.hasPrev,
      },
      filters: {
        query,
        year: yearFilter ? Number(yearFilter) : undefined,
        language: languageFilter,
        hasAwards,
      },
    });
  } catch (error) {
    console.error('Error searching movies:', error);
    return c.json({error: 'Internal server error'}, 500);
  }
});

// Get movie details with all translations
moviesRoutes.get('/:id', async c => {
  try {
    const moviesService = new MoviesService(c.env);
    const movieId = c.req.param('id');
    if (!movieId) {
      return c.json({error: 'Missing id parameter'}, 400);
    }

    const locale = c.req.query('locale') || 'ja';
    const cache = new EdgeCache(undefined, c.env.CACHE_KV);

    // Check cache first
    const cacheLocale = normalizeCacheLocale(locale);
    const cacheKey = cacheLocale
      ? getCacheKeyForMovie(movieId, true, cacheLocale)
      : undefined;
    const cachedResponse = cacheKey ? await cache.get(cacheKey) : undefined;

    if (cachedResponse) {
      console.log('Cache hit for movie details:', movieId);
      return c.json(cachedResponse.data as Record<string, unknown>);
    }

    console.log('Cache miss for movie details:', movieId);

    const movieDetails = await moviesService.getMovieDetails(movieId, locale);

    const imdbUrl = movieDetails.imdbId
      ? `https://www.imdb.com/title/${movieDetails.imdbId}/`
      : undefined;

    const result = {
      uid: movieDetails.uid,
      year: movieDetails.year,
      originalLanguage: movieDetails.originalLanguage,
      imdbId: movieDetails.imdbId,
      tmdbId: movieDetails.tmdbId,
      imdbUrl,
      posterUrl: movieDetails.posterUrl,
      title: movieDetails.title,
      description: movieDetails.description,
      nominations: movieDetails.nominations,
      articleLinks: movieDetails.articleLinks,
      credits: movieDetails.credits,
    };

    // Create ETag for the response
    const etag = createETag(result);

    // Check if client has the same version
    if (shouldCheckETag(c.req, etag)) {
      return c.newResponse('', 304, {
        ETag: etag,
        'Cache-Control': 'public, max-age=86400',
      });
    }

    // Create cached response with 24 hour TTL
    const ttl = getCacheTTL.movie.full;
    const response = createCachedResponse(result, ttl, {
      ETag: etag,
      'X-Cache-Status': 'MISS',
    });

    // Store in cache (reader expects the {data, cachedAt} envelope from set())
    if (cacheKey) {
      await cache.set(cacheKey, result, ttl);
    }

    return response;
  } catch (error) {
    console.error('Error fetching movie details:', error);

    if (error instanceof Error && error.message === 'Movie not found') {
      return c.json({error: 'Movie not found'}, 404);
    }

    return c.json({error: 'Internal server error'}, 500);
  }
});

// Related movies sharing an award category
moviesRoutes.get('/:id/related', async c => {
  try {
    const database = getDatabase(c.env);
    const movieId = c.req.param('id');
    const locale = c.req.query('locale') === 'en' ? 'en' : 'ja';
    const limitParameter = Number(c.req.query('limit') ?? '6');
    const limit =
      Number.isSafeInteger(limitParameter) && limitParameter > 0
        ? Math.min(limitParameter, 12)
        : 6;

    const relatedCache = new EdgeCache(undefined, c.env.CACHE_KV);
    const cacheKey = `movie:${movieId}:related:${locale}:${limit}:v1`;
    const cached = await relatedCache.get(cacheKey);
    if (cached) {
      return c.json(cached.data as Record<string, unknown>);
    }

    const target = await database
      .select({uid: movies.uid, year: movies.year})
      .from(movies)
      .where(and(eq(movies.uid, movieId), isNull(movies.deletedAt)))
      .limit(1);

    if (target.length === 0) {
      return c.json({error: 'Movie not found'}, 404);
    }

    const targetYear = target[0].year ?? 0;

    const candidates = await database
      .select({
        uid: movies.uid,
        year: movies.year,
      })
      .from(nominations)
      .innerJoin(movies, eq(nominations.movieUid, movies.uid))
      .where(
        and(
          sql`${nominations.categoryUid} IN (
            SELECT category_uid FROM nominations WHERE movie_uid = ${movieId}
          )`,
          sql`${movies.uid} != ${movieId}`,
          isNull(movies.deletedAt),
        ),
      )
      .groupBy(movies.uid)
      .orderBy(
        sql`MAX(${nominations.isWinner}) DESC`,
        sql`ABS(COALESCE(${movies.year}, 0) - ${targetYear}) ASC`,
      )
      .limit(limit);

    const candidateUids = candidates.map(row => row.uid);
    const rows =
      candidateUids.length > 0
        ? await database
            .select({
              uid: movies.uid,
              localeTitle: sql<string | undefined>`(
                SELECT content FROM translations
                WHERE resource_type = 'movie_title'
                  AND resource_uid = movies.uid
                  AND language_code = ${locale}
                LIMIT 1
              )`,
              defaultTitle: sql<string | undefined>`(
                SELECT content FROM translations
                WHERE resource_type = 'movie_title'
                  AND resource_uid = movies.uid
                  AND is_default = 1
                LIMIT 1
              )`,
              posterUrl: sql<string | undefined>`(
                SELECT url FROM poster_urls
                WHERE movie_uid = movies.uid
                ORDER BY is_primary DESC
                LIMIT 1
              )`,
            })
            .from(movies)
            .where(inArray(movies.uid, candidateUids))
        : [];

    const rowsByUid = new Map(rows.map(row => [row.uid, row]));
    const relatedMovies = candidates.map(candidate => {
      const row = rowsByUid.get(candidate.uid);
      return {
        uid: candidate.uid,
        title: row?.localeTitle ?? row?.defaultTitle ?? 'Unknown Title',
        year: candidate.year ?? undefined,
        posterUrl: row?.posterUrl ?? undefined,
      };
    });

    const result = {movies: relatedMovies};
    await relatedCache.set(cacheKey, result, getCacheTTL.movie.related);

    return createCachedResponse(result, getCacheTTL.movie.related);
  } catch (error) {
    console.error('Error fetching related movies:', error);
    return c.json({error: 'Internal server error'}, 500);
  }
});

// Add or update movie translation
moviesRoutes.post('/:id/translations', authMiddleware, async c => {
  try {
    const moviesService = new MoviesService(c.env);
    const movieId = c.req.param('id');
    if (!movieId) {
      return c.json({error: 'Missing id parameter'}, 400);
    }

    const {
      languageCode,
      content: rawContent,
      isDefault: rawIsDefault,
    } = await c.req.json();

    if (!languageCode || !rawContent) {
      return c.json({error: 'languageCode and content are required'}, 400);
    }

    if (languageCode.length !== 2) {
      return c.json({error: 'Language code must be 2 characters'}, 400);
    }

    const content = sanitizeText(rawContent);
    const isDefault = [true, 1, 'true', '1'].includes(
      rawIsDefault as boolean | number | string,
    );

    await moviesService.addMovieTranslation(
      movieId,
      languageCode,
      content,
      isDefault,
    );

    await invalidateMovieCaches(c.env, movieId);

    console.log(
      `Cache invalidated for movie ${movieId} after translation update`,
    );

    return c.json({success: true});
  } catch (error) {
    console.error('Error adding/updating translation:', error);

    if (error instanceof Error && error.message === 'Movie not found') {
      return c.json({error: 'Movie not found'}, 404);
    }

    return c.json({error: 'Internal server error'}, 500);
  }
});

// Delete movie translation
moviesRoutes.delete('/:id/translations/:lang', authMiddleware, async c => {
  try {
    const moviesService = new MoviesService(c.env);
    const movieId = c.req.param('id');
    const languageCode = c.req.param('lang');
    if (!movieId || !languageCode) {
      return c.json({error: 'Missing required parameters'}, 400);
    }

    await moviesService.deleteMovieTranslation(movieId, languageCode);

    await invalidateMovieCaches(c.env, movieId);

    console.log(
      `Cache invalidated for movie ${movieId} after translation deletion`,
    );

    return c.json({success: true});
  } catch (error) {
    console.error('Error deleting translation:', error);
    return c.json({error: 'Internal server error'}, 500);
  }
});

// Submit article link
moviesRoutes.post('/:id/article-links', async c => {
  try {
    const database = getDatabase(c.env);
    const movieId = c.req.param('id');
    if (!movieId) {
      return c.json({error: 'Missing id parameter'}, 400);
    }

    const {
      url: rawUrl,
      title: rawTitle,
      description: rawDescription,
      captchaToken: rawCaptchaToken,
    } = await c.req.json();

    if (!rawUrl || !rawTitle) {
      return c.json({error: 'URL and title are required'}, 400);
    }

    if (!rawCaptchaToken) {
      return c.json({error: 'Captcha token is required'}, 400);
    }

    if (rawTitle.length > 200) {
      return c.json({error: 'Title too long'}, 400);
    }

    if (rawDescription && rawDescription.length > 500) {
      return c.json({error: 'Description too long'}, 400);
    }

    const url = sanitizeUrl(rawUrl);
    const title = sanitizeText(rawTitle);
    const description = rawDescription
      ? sanitizeText(rawDescription)
      : undefined;
    const captchaToken =
      typeof rawCaptchaToken === 'string' ? rawCaptchaToken.trim() : '';

    if (!captchaToken) {
      return c.json({error: 'Captcha token is required'}, 400);
    }

    // Check if movie exists
    const movieExists = await database
      .select({uid: movies.uid})
      .from(movies)
      .where(and(eq(movies.uid, movieId), isNull(movies.deletedAt)))
      .limit(1);

    if (movieExists.length === 0) {
      return c.json({error: 'Movie not found'}, 404);
    }

    // Get IP address for rate limiting and Turnstile verification
    const ip =
      c.req.header('cf-connecting-ip') ||
      c.req.header('x-forwarded-for') ||
      c.req.header('x-real-ip') ||
      'unknown';

    const nodeEnvironment =
      typeof process === 'undefined' ? undefined : process.env?.NODE_ENV;
    const isTestEnvironment = nodeEnvironment === 'test';

    if (!isTestEnvironment) {
      try {
        const verification = await verifyTurnstileToken(
          c.env.TURNSTILE_SECRET_KEY,
          captchaToken,
          ip,
        );

        if (!verification.success) {
          console.warn(
            'Turnstile verification failed',
            verification['error-codes'],
          );
          return c.json(
            {error: 'Turnstile verification failed. Please try again.'},
            400,
          );
        }
      } catch (verificationError) {
        console.error('Error verifying Turnstile token:', verificationError);
        return c.json(
          {error: 'Failed to verify submission. Please try again later.'},
          500,
        );
      }
    }

    // Check rate limit (max 10 submissions per IP per hour)
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);

    const recentSubmissions = await database
      .select({count: sql<number>`count(*)`})
      .from(articleLinks)
      .where(
        and(
          eq(articleLinks.submitterIp, ip),
          sql`${articleLinks.submittedAt} > ${oneHourAgo}`,
        ),
      );

    if (recentSubmissions[0].count >= 10) {
      return c.json(
        {error: 'Rate limit exceeded. Please try again later.'},
        429,
      );
    }

    // Insert article link
    const newArticle = await database
      .insert(articleLinks)
      .values({
        movieUid: movieId,
        url,
        title: title.slice(0, 200), // Limit title length
        description: description ? description.slice(0, 500) : undefined,
        submitterIp: ip,
      })
      .returning();

    await invalidateMovieCaches(c.env, movieId);

    return c.json(newArticle[0], 201);
  } catch (error) {
    console.error('Error submitting article link:', error);
    return c.json({error: 'Internal server error'}, 500);
  }
});

// Get article links for a movie
moviesRoutes.get('/:id/article-links', async c => {
  try {
    const database = getDatabase(c.env);
    const movieId = c.req.param('id');
    if (!movieId) {
      return c.json({error: 'Missing id parameter'}, 400);
    }

    const articles = await database
      .select({
        uid: articleLinks.uid,
        url: articleLinks.url,
        title: articleLinks.title,
        description: articleLinks.description,
        submittedAt: articleLinks.submittedAt,
      })
      .from(articleLinks)
      .where(
        and(
          eq(articleLinks.movieUid, movieId),
          eq(articleLinks.isSpam, false),
          eq(articleLinks.isFlagged, false),
        ),
      )
      .orderBy(sql`${articleLinks.submittedAt} DESC`)
      .limit(20);

    return c.json(articles);
  } catch (error) {
    console.error('Error fetching article links:', error);
    return c.json({error: 'Internal server error'}, 500);
  }
});

const AVAILABILITY_RATE_LIMIT = 30;
const AVAILABILITY_RATE_WINDOW_MS = 60 * 60 * 1000;
const AVAILABILITY_RATE_LOG_MAX_ENTRIES = 10_000;
const availabilityRequestLog = new Map<
  string,
  {windowStart: number; count: number}
>();

function isAvailabilityRateLimited(ip: string, now = Date.now()): boolean {
  if (availabilityRequestLog.size > AVAILABILITY_RATE_LOG_MAX_ENTRIES) {
    availabilityRequestLog.clear();
  }

  const entry = availabilityRequestLog.get(ip);
  if (!entry || now - entry.windowStart > AVAILABILITY_RATE_WINDOW_MS) {
    availabilityRequestLog.set(ip, {windowStart: now, count: 1});
    return false;
  }

  entry.count++;
  return entry.count > AVAILABILITY_RATE_LIMIT;
}

moviesRoutes.post('/:id/availability/check', async c => {
  const ip =
    c.req.header('cf-connecting-ip') ||
    c.req.header('x-forwarded-for') ||
    c.req.header('x-real-ip') ||
    'unknown';

  if (isAvailabilityRateLimited(ip)) {
    return c.json({error: 'Rate limit exceeded. Please try again later.'}, 429);
  }

  try {
    const service = new AvailabilityService(c.env);
    const result = await service.checkMovie(
      c.req.param('id'),
      buildOnDemandRunners(c.env),
    );

    if (!result) {
      return c.json({error: 'Movie not found'}, 404);
    }

    return c.json(result);
  } catch (error) {
    console.error('Error checking availability:', error);
    return c.json({error: 'Internal server error'}, 500);
  }
});
