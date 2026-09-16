import type {Context} from 'hono';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../services/errors';

export function serviceErrorResponse(
  c: Context,
  error: unknown,
): Response | undefined {
  if (error instanceof ValidationError) {
    return c.json({error: error.message}, 400);
  }

  if (error instanceof NotFoundError) {
    return c.json({error: error.message}, 404);
  }

  if (error instanceof ConflictError) {
    return c.json({error: error.message}, 409);
  }

  return undefined;
}
