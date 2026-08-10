import type {Context} from 'hono';
import {
  type ApiErrorResponse,
  type AuthenticationError,
  type RateLimitError,
  type ValidationError,
  ErrorCodes,
} from '../types/errors.js';

export function createValidationError(
  c: Context,
  validationErrors: Array<{field: string; message: string}>,
): Response {
  const errorResponse: ValidationError = {
    error: 'Validation failed',
    code: ErrorCodes.VALIDATION_ERROR,
    details: validationErrors,
  };
  return c.json(errorResponse, 400);
}

export function createRateLimitError(
  c: Context,
  resetTime: number,
  limit: number,
): Response {
  const errorResponse: RateLimitError = {
    error: 'Rate limit exceeded',
    code: ErrorCodes.RATE_LIMIT_EXCEEDED,
    details: {
      resetTime,
      limit,
    },
  };
  return c.json(errorResponse, 429);
}

export function createAuthenticationError(
  c: Context,
  reason:
    'INVALID_TOKEN' | 'EXPIRED_TOKEN' | 'MISSING_TOKEN' | 'INVALID_CREDENTIALS',
): Response {
  const messages = {
    INVALID_TOKEN: 'Invalid authentication token',
    EXPIRED_TOKEN: 'Authentication token has expired',
    MISSING_TOKEN: 'Authentication token is required',
    INVALID_CREDENTIALS: 'Invalid credentials provided',
  };

  const errorResponse: AuthenticationError = {
    error: messages[reason],
    code: ErrorCodes.AUTHENTICATION_ERROR,
    details: {reason},
  };
  return c.json(errorResponse, 401);
}

export function createInternalServerError(
  c: Context,
  originalError?: unknown,
  context?: string,
): Response {
  console.error(
    `Internal server error${context ? ` in ${context}` : ''}:`,
    originalError,
  );

  const errorResponse: ApiErrorResponse = {
    error: 'Internal server error',
    code: ErrorCodes.INTERNAL_ERROR,
  };
  return c.json(errorResponse, 500);
}

export function isValidationError(error: unknown): error is {
  issues: Array<{path: Array<string | number>; message: string}>;
} {
  return (
    typeof error === 'object' &&
    error !== null &&
    'issues' in error &&
    Array.isArray((error as {issues: unknown}).issues)
  );
}

export function formatZodErrors(zodError: {
  issues: Array<{path: Array<string | number>; message: string}>;
}): Array<{field: string; message: string}> {
  return zodError.issues.map(issue => ({
    field: issue.path.join('.') || 'root',
    message: issue.message,
  }));
}
