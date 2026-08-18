import type {Environment} from '@shine/database';
import {Hono} from 'hono';
import {createJWT, isPasswordCorrect} from '../auth';
import {loginRateLimiter} from '../login-rate-limiter';
import {
  createAuthenticationError,
  createInternalServerError,
  createRateLimitError,
  createValidationError,
} from '../utils/error-handlers';

export const authRoutes = new Hono<{Bindings: Environment}>();

authRoutes.post('/login', async c => {
  try {
    const clientIp = c.req.header('CF-Connecting-IP') ?? 'unknown';
    if (loginRateLimiter.isBlocked(clientIp)) {
      return createRateLimitError(
        c,
        Date.now() + loginRateLimiter.windowMs,
        loginRateLimiter.limit,
      );
    }

    const {password} = await c.req.json();

    if (!password) {
      return createValidationError(c, [
        {field: 'password', message: 'Password is required'},
      ]);
    }

    if (!c.env.ADMIN_PASSWORD) {
      return createInternalServerError(
        c,
        new Error('ADMIN_PASSWORD not configured'),
        'authentication setup',
      );
    }

    if (!c.env.JWT_SECRET) {
      return createInternalServerError(
        c,
        new Error('JWT_SECRET not configured'),
        'authentication setup',
      );
    }

    if (!(await isPasswordCorrect(password, c.env.ADMIN_PASSWORD))) {
      loginRateLimiter.recordFailure(clientIp);
      return createAuthenticationError(c, 'INVALID_CREDENTIALS');
    }

    loginRateLimiter.clear(clientIp);
    const token = await createJWT(c.env.JWT_SECRET);
    return c.json({token});
  } catch (error) {
    return createInternalServerError(c, error, 'authentication');
  }
});
