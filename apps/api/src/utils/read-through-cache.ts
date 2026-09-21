import {type Context} from 'hono';
import {type EdgeCache, writeCacheAfterResponse} from './cache';

export const STALE_RETENTION = 2_592_000;

export type ReadThroughStatus = 'HIT' | 'STALE' | 'MISS';

type ReadThroughOptions<T> = {
  key: string;
  ttl: number;
  edgeTtl?: number;
  load: () => Promise<T | undefined>;
};

async function revalidate<T>(
  cache: EdgeCache,
  {key, ttl, load}: ReadThroughOptions<T>,
): Promise<void> {
  try {
    const data = await load();
    await (data === undefined
      ? cache.delete(key)
      : cache.set(key, data, ttl, {staleRetention: STALE_RETENTION}));
  } catch (error) {
    console.error(`Cache revalidation failed for ${key}:`, error);
  }
}

export async function readThroughCache<T>(
  context: Pick<Context, 'executionCtx'>,
  cache: EdgeCache,
  options: ReadThroughOptions<T>,
): Promise<{data: T | undefined; status: ReadThroughStatus}> {
  const {key, ttl, edgeTtl, load} = options;
  const cached = await cache.get(key, edgeTtl ? {edgeTtl} : undefined);

  if (cached) {
    const isExpired = Date.now() - cached.cachedAt > ttl * 1000;
    if (isExpired) {
      await writeCacheAfterResponse(context, revalidate(cache, options));
    }

    return {data: cached.data as T, status: isExpired ? 'STALE' : 'HIT'};
  }

  const data = await load();
  if (data !== undefined) {
    await writeCacheAfterResponse(
      context,
      cache.set(key, data, ttl, {staleRetention: STALE_RETENTION}),
    );
  }

  return {data, status: 'MISS'};
}
