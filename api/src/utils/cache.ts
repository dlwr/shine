export interface CacheConfig {
  key: string;
  ttl: number;
  headers?: Record<string, string>;
}

export interface CacheMetrics {
  hits: number;
  misses: number;
  hitRate: number;
}

export class EdgeCache {
  private cache = (caches as unknown as { default: Cache }).default;
  private metrics: CacheMetrics = { hits: 0, misses: 0, hitRate: 0 };
  private isDevelopment = true; // Always disable cache in development

  async get(key: string): Promise<Response | undefined> {
    if (this.isDevelopment) {
      this.metrics.misses++;
      this.updateHitRate();
      return undefined;
    }

    try {
      const cached = await this.cache.match(key);
      if (cached) {
        this.metrics.hits++;
        this.updateHitRate();
        return cached;
      }
      this.metrics.misses++;
      this.updateHitRate();
      return undefined;
    } catch (error) {
      console.error("Cache get error:", error);
      this.metrics.misses++;
      this.updateHitRate();
      return undefined;
    }
  }

  async put(key: string, response: Response, ttl?: number): Promise<void> {
    if (this.isDevelopment) {
      return;
    }

    try {
      const responseToCache = response.clone();

      if (ttl) {
        const headers = new Headers(responseToCache.headers);
        headers.set("Cache-Control", `public, max-age=${ttl}, s-maxage=${ttl}`);
        const cachedResponse = new Response(responseToCache.body, {
          status: responseToCache.status,
          statusText: responseToCache.statusText,
          headers: headers,
        });
        await this.cache.put(key, cachedResponse);
      } else {
        await this.cache.put(key, responseToCache);
      }
    } catch (error) {
      console.error("Cache put error:", error);
    }
  }

  async delete(key: string): Promise<boolean> {
    if (this.isDevelopment) {
      return true;
    }

    try {
      return await this.cache.delete(key);
    } catch (error) {
      console.error("Cache delete error:", error);
      return false;
    }
  }

  async deleteByPattern(pattern: string): Promise<number> {
    if (this.isDevelopment) {
      return 0;
    }

    try {
      let deleted = 0;
      const keys = await this.cache.keys();
      for (const request of keys) {
        if (request.url.includes(pattern)) {
          const success = await this.cache.delete(request);
          if (success) deleted++;
        }
      }
      return deleted;
    } catch (error) {
      console.error("Cache delete by pattern error:", error);
      return 0;
    }
  }

  getMetrics(): CacheMetrics {
    return { ...this.metrics };
  }

  private updateHitRate(): void {
    const total = this.metrics.hits + this.metrics.misses;
    this.metrics.hitRate = total > 0 ? this.metrics.hits / total : 0;
  }
}

export const getCacheKeyForSelection = (
  type: string,
  date: string,
  locale: string,
): string => {
  return `selections:${type}:${date}:${locale}:v1`;
};

export const getCacheKeyForMovie = (
  movieId: string,
  includeDetails = false,
): string => {
  const suffix = includeDetails ? "full" : "basic";
  return `movie:${movieId}:${suffix}:v1`;
};

export const getCacheKeyForSearch = (
  query: string,
  page: number,
  limit: number,
  filters: Record<string, unknown>,
): string => {
  const filterString = Object.entries(filters)
    .filter(
      ([, value]) => value !== undefined && value !== null && value !== "",
    )
    .map(([key, value]) => `${key}:${value}`)
    .sort()
    .join("|");

  return `search:${query || "all"}:${page}:${limit}:${filterString}:v1`;
};

export const getCacheKeyForUrlTitle = (url: string): string => {
  let hash = 0;
  for (let index = 0; index < url.length; index++) {
    const char = url.codePointAt(index) || 0;
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
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
    "Content-Type": "application/json",
    "Cache-Control": `public, max-age=${ttl}, s-maxage=${ttl}`,
    "X-Cache-TTL": ttl.toString(),
    ...additionalHeaders,
  };

  return new Response(JSON.stringify(data), { headers });
};

export const shouldCacheSearch = (
  query: string,
  year?: number,
  language?: string,
): boolean => {
  if (!query || query.length < 3) return true;
  if (year !== undefined || language !== undefined) return false;

  const commonQueries = [
    "アカデミー",
    "oscar",
    "cannes",
    "カンヌ",
    "日本アカデミー",
    "winner",
    "受賞",
    "ノミネート",
    "nominated",
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
    hash = hash & hash;
  }
  return `"${Math.abs(hash).toString(16)}"`;
};

export const checkETag = (
  request: { header: (name: string) => string | undefined },
  etag: string,
): boolean => {
  const ifNoneMatch = request.header("If-None-Match");
  return ifNoneMatch === etag;
};
