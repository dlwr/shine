import {getDatabase, type Environment} from '@shine/database';
import {Hono} from 'hono';
import {MoviesService} from '../../services';
import {findRelatedMovies} from '../../services/related-movies';
import {
  createCachedResponse,
  createETag,
  EdgeCache,
  getCacheKeyForMovie,
  getCacheTTL,
  IMPORTED_DATA_EDGE_TTL,
  normalizeCacheLocale,
  shouldCheckETag,
  writeCacheAfterResponse,
} from '../../utils/cache';

export const movieDetailRoutes = new Hono<{Bindings: Environment}>();

// Get movie details with all translations
movieDetailRoutes.get('/:id', async c => {
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
      ? getCacheKeyForMovie(movieId, cacheLocale)
      : undefined;
    const cachedResponse = cacheKey ? await cache.get(cacheKey) : undefined;

    if (cachedResponse) {
      console.log('Cache hit for movie details:', movieId);
      return c.json(cachedResponse.data as Record<string, unknown>, 200, {
        'X-Cache-Status': 'HIT',
      });
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
    const ttl = getCacheTTL.movie.details;
    const response = createCachedResponse(result, ttl, {
      ETag: etag,
      'X-Cache-Status': 'MISS',
    });

    if (cacheKey) {
      await writeCacheAfterResponse(c, cache.set(cacheKey, result, ttl));
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
movieDetailRoutes.get('/:id/related', async c => {
  try {
    const movieId = c.req.param('id');
    const locale = c.req.query('locale') === 'en' ? 'en' : 'ja';
    const limitParameter = Number(c.req.query('limit') ?? '6');
    const limit =
      Number.isSafeInteger(limitParameter) && limitParameter > 0
        ? Math.min(limitParameter, 12)
        : 6;

    const relatedCache = new EdgeCache(undefined, c.env.CACHE_KV);
    const cacheKey = `movie:${movieId}:related:${locale}:${limit}:v2`;
    const cached = await relatedCache.get(cacheKey, {
      edgeTtl: IMPORTED_DATA_EDGE_TTL,
    });
    if (cached) {
      return c.json(cached.data as Record<string, unknown>, 200, {
        'X-Cache-Status': 'HIT',
      });
    }

    const relatedMovies = await findRelatedMovies(
      getDatabase(c.env),
      movieId,
      locale,
      limit,
    );

    if (!relatedMovies) {
      return c.json({error: 'Movie not found'}, 404);
    }

    const result = {movies: relatedMovies};
    await writeCacheAfterResponse(
      c,
      relatedCache.set(cacheKey, result, getCacheTTL.movie.related),
    );

    return createCachedResponse(result, getCacheTTL.movie.related, {
      'X-Cache-Status': 'MISS',
    });
  } catch (error) {
    console.error('Error fetching related movies:', error);
    return c.json({error: 'Internal server error'}, 500);
  }
});
