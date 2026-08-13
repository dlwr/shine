export type CacheConfig = {
  key: string;
  ttl: number;
  headers?: Record<string, string>;
};

export type CacheMetrics = {
  hits: number;
  misses: number;
  hitRate: number;
};

export class EdgeCache {
  private readonly cache: Cache;
  private readonly metrics: CacheMetrics = {hits: 0, misses: 0, hitRate: 0};

  constructor(cacheStorage?: Cache) {
    this.cache =
      cacheStorage ?? (caches as unknown as {default: Cache}).default;
  }

  // Cache API keys must be valid request URLs; map logical keys onto one
  private keyToUrl(key: string): string {
    return `https://edge-cache.internal/${encodeURIComponent(key)}`;
  }

  async getResponse(key: string): Promise<Response | undefined> {
    try {
      const cached = await this.cache.match(this.keyToUrl(key));
      if (cached) {
        this.metrics.hits++;
        this.updateHitRate();
        return cached;
      }

      this.metrics.misses++;
      this.updateHitRate();
      return undefined;
    } catch (error) {
      console.error('Cache get error:', error);
      this.metrics.misses++;
      this.updateHitRate();
      return undefined;
    }
  }

  async put(key: string, response: Response, ttl?: number): Promise<void> {
    try {
      const responseToCache = response.clone();

      if (ttl) {
        const headers = new Headers(responseToCache.headers);
        headers.set('Cache-Control', `public, max-age=${ttl}, s-maxage=${ttl}`);
        const cachedResponse = new Response(responseToCache.body, {
          status: responseToCache.status,
          statusText: responseToCache.statusText,
          headers,
        });
        await this.cache.put(this.keyToUrl(key), cachedResponse);
      } else {
        await this.cache.put(this.keyToUrl(key), responseToCache);
      }
    } catch (error) {
      console.error('Cache put error:', error);
    }
  }

  async set(key: string, data: unknown, ttl = 3600): Promise<void> {
    try {
      const response = Response.json(
        {data, cachedAt: Date.now()},
        {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': `max-age=${ttl}`,
          },
        },
      );
      await this.cache.put(this.keyToUrl(key), response);
    } catch (error) {
      console.error('Cache set error:', error);
    }
  }

  async get(
    key: string,
  ): Promise<{data: unknown; cachedAt: number} | undefined> {
    try {
      const cached = await this.cache.match(this.keyToUrl(key));
      if (cached) {
        const result: {
          data: unknown;
          cachedAt: number;
        } = await cached.json();
        this.metrics.hits++;
        this.updateHitRate();
        return result;
      }

      this.metrics.misses++;
      this.updateHitRate();
      return undefined;
    } catch (error) {
      console.error('Cache get error:', error);
      this.metrics.misses++;
      this.updateHitRate();
      return undefined;
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      return await this.cache.delete(this.keyToUrl(key));
    } catch (error) {
      console.error('Cache delete error:', error);
      return false;
    }
  }

  async deleteByPattern(pattern: string): Promise<number> {
    try {
      // Note: cache.keys() is unsupported on Cloudflare Workers; this only
      // works in tests. Prefer explicit key deletion.
      const keys = await this.cache.keys();
      const encodedPattern = encodeURIComponent(pattern);
      const deletePromises = keys
        .filter(request => request.url.includes(encodedPattern))
        .map(async request => this.cache.delete(request));

      const results = await Promise.all(deletePromises);
      const deleted = results.filter(Boolean).length;

      return deleted;
    } catch (error) {
      console.error('Cache delete by pattern error:', error);
      return 0;
    }
  }

  getMetrics(): CacheMetrics {
    return {...this.metrics};
  }

  private updateHitRate(): void {
    const total = this.metrics.hits + this.metrics.misses;
    this.metrics.hitRate = total > 0 ? this.metrics.hits / total : 0;
  }
}

export const CACHEABLE_LOCALES = ['en', 'ja'] as const;
export type CacheableLocale = (typeof CACHEABLE_LOCALES)[number];

// Cached payloads are locale-dependent; only cache locales we can purge later
export const normalizeCacheLocale = (
  locale: string,
): CacheableLocale | undefined => {
  const language = locale.split('-')[0] as CacheableLocale;
  return CACHEABLE_LOCALES.includes(language) ? language : undefined;
};

export const getCacheKeyForSelection = (
  type: string,
  date: string,
  locale: string,
): string => `selections:${type}:${date}:${locale}:v1`;

export const getCacheKeyForMovie = (
  movieId: string,
  includeDetails = false,
  locale: string = 'ja',
): string => {
  const suffix = includeDetails ? 'full' : 'basic';
  return `movie:${movieId}:${suffix}:${locale}:v3`;
};

export const getMovieCacheKeysForAllLocales = (movieId: string): string[] =>
  CACHEABLE_LOCALES.flatMap(locale => [
    getCacheKeyForMovie(movieId, true, locale),
    getCacheKeyForMovie(movieId, false, locale),
  ]);

export const getCacheKeyForSearch = (
  query: string,
  page: number,
  limit: number,
  filters: Record<string, unknown>,
): string => {
  const entries = Object.entries(filters).filter(
    ([, value]) => value !== undefined && value !== null && value !== '',
  );
  const sortedEntries: Array<[string, unknown]> = [];
  for (const entry of entries) {
    const insertIndex = sortedEntries.findIndex(
      current => current[0] > entry[0],
    );
    if (insertIndex === -1) {
      sortedEntries.push(entry);
    } else {
      sortedEntries.splice(insertIndex, 0, entry);
    }
  }
  const filterString = sortedEntries
    .map(([key, value]) => `${key}:${String(value)}`)
    .join('|');

  return `search:${query || 'all'}:${page}:${limit}:${filterString}:v1`;
};

export const getCacheKeyForUrlTitle = (url: string): string => {
  let hash = 0;
  for (let index = 0; index < url.length; index++) {
    const char = url.codePointAt(index) || 0;
    hash = (hash << 5) - hash + char;
    hash &= hash;
  }

  const urlHash = Math.abs(hash).toString(16).slice(0, 16);
  return `url:title:${urlHash}:v1`;
};

export const getCacheTTL = {
  selections: {
    daily: 3600, // 1 hour
    weekly: 21_600, // 6 hours
    monthly: 86_400, // 24 hours
  },
  movie: {
    basic: 3600, // 1 hour
    full: 86_400, // 24 hours
    related: 604_800, // 1 week
  },
  search: {
    common: 1800, // 30 minutes
    specific: 600, // 10 minutes
  },
  admin: {
    movies: 600, // 10 minutes
    search: 300, // 5 minutes
  },
  utility: {
    urlTitle: 604_800, // 1 week
  },
} as const;

export const createCachedResponse = (
  data: unknown,
  ttl: number,
  additionalHeaders: Record<string, string> = {},
): Response => {
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': `public, max-age=${ttl}, s-maxage=${ttl}`,
    'X-Cache-TTL': ttl.toString(),
    ...additionalHeaders,
  };

  return Response.json(data, {headers});
};

export const shouldCacheSearch = (
  query: string,
  year?: number,
  language?: string,
): boolean => {
  if (!query || query.length < 3) {
    return true;
  }

  if (year !== undefined || language !== undefined) {
    return false;
  }

  const commonQueries = [
    'アカデミー',
    'oscar',
    'cannes',
    'カンヌ',
    '日本アカデミー',
    'winner',
    '受賞',
    'ノミネート',
    'nominated',
  ];

  return commonQueries.some(common =>
    query.toLowerCase().includes(common.toLowerCase()),
  );
};

export const createETag = (data: unknown): string => {
  const content = JSON.stringify(data);
  let hash = 0;
  for (let index = 0; index < content.length; index++) {
    const char = content.codePointAt(index) || 0;
    hash = (hash << 5) - hash + char;
    hash &= hash;
  }

  return `"${Math.abs(hash).toString(16)}"`;
};

export const checkETag = (
  request: {header: (name: string) => string | undefined},
  etag: string,
): boolean => {
  const ifNoneMatch = request.header('If-None-Match');
  return ifNoneMatch === etag;
};
