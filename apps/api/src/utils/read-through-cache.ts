import {
  type EdgeCache,
  type RequestContext,
  writeCacheAfterResponse,
} from './cache';
import {logErrorWithCause} from './log-error';

export const STALE_RETENTION = 2_592_000;

const KV_MINIMUM_CACHE_TTL = 60;

const revalidationStartedAt = new Map<string, number>();

export function clearRevalidationHistory(): void {
  revalidationStartedAt.clear();
}

function canStartRevalidation(
  key: string,
  edgeTtl: number | undefined,
): boolean {
  const now = Date.now();
  const startedAt = revalidationStartedAt.get(key);
  const window = Math.max(edgeTtl ?? 0, KV_MINIMUM_CACHE_TTL) * 1000;
  if (startedAt !== undefined && now - startedAt < window) {
    return false;
  }

  revalidationStartedAt.set(key, now);
  return true;
}

export type ReadThroughStatus = 'HIT' | 'STALE' | 'MISS';

type ReadThroughOptions<T> = {
  key: string;
  ttl: number;
  edgeTtl?: number;
  load: () => Promise<T | undefined>;
};

async function loadWithRetry<T>(
  key: string,
  load: () => Promise<T | undefined>,
): Promise<T | undefined> {
  try {
    return await load();
  } catch (error) {
    logErrorWithCause(`Cache load failed for ${key}, retrying once:`, error);
    return load();
  }
}

async function revalidate<T>(
  cache: EdgeCache,
  {key, ttl, load}: ReadThroughOptions<T>,
): Promise<void> {
  try {
    const data = await loadWithRetry(key, load);
    await (data === undefined
      ? cache.delete(key)
      : cache.set(key, data, ttl, {staleRetention: STALE_RETENTION}));
  } catch (error) {
    revalidationStartedAt.delete(key);
    logErrorWithCause(`Cache revalidation failed for ${key}:`, error);
  }
}

export async function readThroughCache<T>(
  context: RequestContext | undefined,
  cache: EdgeCache,
  options: ReadThroughOptions<T>,
): Promise<{data: T | undefined; status: ReadThroughStatus}> {
  const {key, ttl, edgeTtl, load} = options;
  const cached = await cache.get(key, edgeTtl ? {edgeTtl} : undefined);

  if (cached) {
    const isExpired = Date.now() - cached.cachedAt > ttl * 1000;
    if (isExpired && canStartRevalidation(key, edgeTtl)) {
      await writeCacheAfterResponse(context, revalidate(cache, options));
    }

    return {data: cached.data as T, status: isExpired ? 'STALE' : 'HIT'};
  }

  const data = await loadWithRetry(key, load);
  if (data !== undefined) {
    await writeCacheAfterResponse(
      context,
      cache.set(key, data, ttl, {staleRetention: STALE_RETENTION}),
    );
  }

  return {data, status: 'MISS'};
}
