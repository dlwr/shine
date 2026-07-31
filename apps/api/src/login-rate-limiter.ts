type LoginRateLimiterOptions = {
  limit?: number;
  windowMs?: number;
};

export function createLoginRateLimiter(options: LoginRateLimiterOptions = {}) {
  const limit = options.limit ?? 5;
  const windowMs = options.windowMs ?? 15 * 60 * 1000;
  const failures = new Map<string, number[]>();

  const prune = (key: string, now: number): number[] => {
    const timestamps = (failures.get(key) ?? []).filter(
      timestamp => now - timestamp < windowMs,
    );
    if (timestamps.length > 0) {
      failures.set(key, timestamps);
    } else {
      failures.delete(key);
    }

    return timestamps;
  };

  return {
    limit,
    windowMs,
    isBlocked(key: string, now = Date.now()): boolean {
      return prune(key, now).length >= limit;
    },
    recordFailure(key: string, now = Date.now()): void {
      const timestamps = prune(key, now);
      timestamps.push(now);
      failures.set(key, timestamps);
    },
    clear(key: string): void {
      failures.delete(key);
    },
    reset(): void {
      failures.clear();
    },
  };
}

export const loginRateLimiter = createLoginRateLimiter();
