const MAX_ENTRIES = 10_000;

type Window = {windowStart: number; count: number};

export type InMemoryRateLimit = (key: string, now?: number) => boolean;

export function createInMemoryRateLimit(options: {
  limit: number;
  windowMs: number;
}): InMemoryRateLimit {
  const log = new Map<string, Window>();

  return (key, now = Date.now()) => {
    if (log.size > MAX_ENTRIES) {
      log.clear();
    }

    const entry = log.get(key);
    if (!entry || now - entry.windowStart > options.windowMs) {
      log.set(key, {windowStart: now, count: 1});
      return false;
    }

    entry.count++;
    return entry.count > options.limit;
  };
}
