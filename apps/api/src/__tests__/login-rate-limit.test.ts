import type {Environment} from '@shine/database';
import {beforeEach, describe, expect, it} from 'vitest';
import {createLoginRateLimiter, loginRateLimiter} from '../login-rate-limiter';
import app from '../index';

const environment: Environment = {
  ADMIN_PASSWORD: 'correct-password',
  JWT_SECRET: 'test-jwt-secret',
};

const login = async (password: string, ip = '203.0.113.1') =>
  app.request(
    '/auth/login',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Connecting-IP': ip,
      },
      body: JSON.stringify({password}),
    },
    environment,
  );

const loginViaBinding = async (password: string, ip: string) =>
  app.request(
    '/auth/login',
    {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'x-real-ip': ip},
      body: JSON.stringify({password}),
    },
    environment,
  );

describe('createLoginRateLimiter', () => {
  it('blocks after the configured number of failures within the window', () => {
    const limiter = createLoginRateLimiter({limit: 3, windowMs: 60_000});
    const now = 1_000_000;

    limiter.recordFailure('ip-a', now);
    limiter.recordFailure('ip-a', now + 1);
    expect(limiter.isBlocked('ip-a', now + 2)).toBe(false);

    limiter.recordFailure('ip-a', now + 3);
    expect(limiter.isBlocked('ip-a', now + 4)).toBe(true);
  });

  it('unblocks after the window has passed', () => {
    const limiter = createLoginRateLimiter({limit: 1, windowMs: 60_000});
    const now = 1_000_000;

    limiter.recordFailure('ip-a', now);
    expect(limiter.isBlocked('ip-a', now + 1)).toBe(true);
    expect(limiter.isBlocked('ip-a', now + 60_001)).toBe(false);
  });

  it('tracks each key independently', () => {
    const limiter = createLoginRateLimiter({limit: 1, windowMs: 60_000});
    const now = 1_000_000;

    limiter.recordFailure('ip-a', now);
    expect(limiter.isBlocked('ip-a', now + 1)).toBe(true);
    expect(limiter.isBlocked('ip-b', now + 1)).toBe(false);
  });

  it('clears failures for a key on demand', () => {
    const limiter = createLoginRateLimiter({limit: 1, windowMs: 60_000});
    const now = 1_000_000;

    limiter.recordFailure('ip-a', now);
    limiter.clear('ip-a');
    expect(limiter.isBlocked('ip-a', now + 1)).toBe(false);
  });
});

describe('POST /auth/login rate limiting', () => {
  beforeEach(() => {
    loginRateLimiter.reset();
  });

  it('returns 429 after repeated failed logins from the same IP', async () => {
    for (let index = 0; index < 5; index++) {
      const response = await login('wrong-password');
      expect(response.status).toBe(401);
    }

    const blocked = await login('wrong-password');
    expect(blocked.status).toBe(429);
    const body = (await blocked.json()) as {code: string};
    expect(body.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('rejects even correct passwords while blocked', async () => {
    for (let index = 0; index < 5; index++) {
      await login('wrong-password');
    }

    const blocked = await login('correct-password');
    expect(blocked.status).toBe(429);
  });

  it('does not rate limit other IPs', async () => {
    for (let index = 0; index < 5; index++) {
      await login('wrong-password', '203.0.113.1');
    }

    const other = await login('correct-password', '203.0.113.2');
    expect(other.status).toBe(200);
  });

  it('counts failures per x-real-ip forwarded through the service binding', async () => {
    for (let index = 0; index < 5; index++) {
      await loginViaBinding('wrong-password', '203.0.113.1');
    }

    const other = await loginViaBinding('correct-password', '203.0.113.2');
    expect(other.status).toBe(200);
  });

  it('clears the failure count after a successful login', async () => {
    for (let index = 0; index < 4; index++) {
      await login('wrong-password');
    }

    const success = await login('correct-password');
    expect(success.status).toBe(200);

    const after = await login('wrong-password');
    expect(after.status).toBe(401);
  });
});

const loginWithLimiter = async (
  limiter: RateLimit,
  headers: Record<string, string>,
) =>
  app.request(
    '/auth/login',
    {
      method: 'POST',
      headers: {'Content-Type': 'application/json', ...headers},
      body: JSON.stringify({password: 'correct-password'}),
    },
    {...environment, LOGIN_RATE_LIMITER: limiter},
  );

describe('POST /auth/login の LOGIN_RATE_LIMITER', () => {
  beforeEach(() => {
    loginRateLimiter.reset();
  });

  it('上限を超えたら正しいパスワードでも 429 を返す', async () => {
    const response = await loginWithLimiter(
      {
        async limit() {
          return {success: false};
        },
      },
      {'CF-Connecting-IP': '203.0.113.1'},
    );

    expect(response.status).toBe(429);
  });

  it('service binding 越しでも訪問者の IP で数える', async () => {
    const keys: string[] = [];

    await loginWithLimiter(
      {
        async limit({key}) {
          keys.push(key);
          return {success: true};
        },
      },
      {'x-real-ip': '203.0.113.9'},
    );

    expect(keys).toEqual(['203.0.113.9']);
  });
});
