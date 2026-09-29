import {type Context} from 'hono';

export type CacheMetrics = {
  hits: number;
  misses: number;
  hitRate: number;
};

export class EdgeCache {
  private readonly metrics: CacheMetrics = {hits: 0, misses: 0, hitRate: 0};

  constructor(private readonly kv?: KVNamespace) {}

  async set(
    key: string,
    data: unknown,
    ttl = 3600,
    options?: {staleRetention?: number},
  ): Promise<void> {
    if (!this.kv) {
      return;
    }

    try {
      await this.kv.put(key, JSON.stringify({data, cachedAt: Date.now()}), {
        expirationTtl: ttl + (options?.staleRetention ?? 0),
      });
    } catch (error) {
      console.error('Cache set error:', error);
    }
  }

  async get(
    key: string,
    options?: {edgeTtl?: number},
  ): Promise<{data: unknown; cachedAt: number} | undefined> {
    try {
      const cached = this.kv
        ? ((await (options?.edgeTtl
            ? this.kv.get(key, {type: 'json', cacheTtl: options.edgeTtl})
            : this.kv.get(key, 'json'))) as {
            data: unknown;
            cachedAt: number;
          } | null)
        : null;
      this.metrics[cached ? 'hits' : 'misses']++;
      this.updateHitRate();
      return cached ?? undefined;
    } catch (error) {
      console.error('Cache get error:', error);
      this.metrics.misses++;
      this.updateHitRate();
      return undefined;
    }
  }

  async delete(key: string): Promise<boolean> {
    if (!this.kv) {
      return false;
    }

    try {
      await this.kv.delete(key);
      return true;
    } catch (error) {
      console.error('Cache delete error:', error);
      return false;
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

export const IMPORTED_DATA_EDGE_TTL = 600;

export const CACHEABLE_LOCALES = ['en', 'ja'] as const;
export type CacheableLocale = (typeof CACHEABLE_LOCALES)[number];

// Cached payloads are locale-dependent; only cache locales we can purge later
export const normalizeCacheLocale = (
  locale: string,
): CacheableLocale | undefined => {
  const language = locale.split('-', 1)[0] as CacheableLocale;
  return CACHEABLE_LOCALES.includes(language) ? language : undefined;
};

export const getCacheKeyForSelection = (
  type: string,
  date: string,
  locale: string,
): string => `selections:${type}:${date}:${locale}:v4`;

export const getCacheKeyForRelatedMovies = (
  movieId: string,
  locale: string,
): string => `movie:${movieId}:related:${locale}:v3`;

export const getCacheKeyForPerson = (
  personUid: string,
  locale: string,
): string => `person:${personUid}:${locale}:v6`;

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

export const getCacheTTL = {
  selections: {
    daily: 3600, // 1 hour
    weekly: 21_600, // 6 hours
    monthly: 86_400, // 24 hours
  },
  movie: {
    details: 86_400, // 24 hours
    related: 604_800, // 7 days
    uids: 86_400, // 24 hours
  },
  search: {
    results: 86_400, // 24 hours
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

export const shouldCheckETag = (
  request: {header: (name: string) => string | undefined},
  etag: string,
): boolean => {
  const ifNoneMatch = request.header('If-None-Match');
  return ifNoneMatch === etag;
};

export type RequestContext = Pick<Context, 'executionCtx'>;

export const writeCacheAfterResponse = async (
  context: RequestContext | undefined,
  write: Promise<void>,
): Promise<void> => {
  if (!context) {
    await write;
    return;
  }

  try {
    context.executionCtx.waitUntil(write);
  } catch {
    await write;
  }
};
