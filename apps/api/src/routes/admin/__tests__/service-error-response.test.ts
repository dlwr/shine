import {Hono} from 'hono';
import {describe, expect, it} from 'vitest';
import {
  ConflictError,
  NotFoundError,
  TmdbConfigError,
  ValidationError,
} from '../../../services/errors';
import {serviceErrorResponse} from '../service-error-response';

async function respond(error: unknown): Promise<Response> {
  const app = new Hono();
  app.get('/', c => serviceErrorResponse(c, error) ?? c.text('unhandled', 500));
  return app.request('/');
}

describe('serviceErrorResponse', () => {
  it('ValidationError は 400 とメッセージ', async () => {
    const response = await respond(new ValidationError('year is required'));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({error: 'year is required'});
  });

  it('NotFoundError は 404', async () => {
    const response = await respond(new NotFoundError('Movie not found'));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({error: 'Movie not found'});
  });

  it('ConflictError は 409', async () => {
    const response = await respond(new ConflictError('already exists'));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({error: 'already exists'});
  });

  it('それ以外は undefined を返して呼び出し側に任せる', async () => {
    const response = await respond(new TmdbConfigError('no key'));
    expect(response.status).toBe(500);
    expect(await response.text()).toBe('unhandled');
  });
});
