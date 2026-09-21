import {type Context} from 'hono';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {createInternalServerError} from '../error-handlers';

const context = {
  json: (body: unknown, status: number) => Response.json(body, {status}),
} as unknown as Context;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createInternalServerError', () => {
  it('500 を返す', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = createInternalServerError(context, new Error('boom'));

    expect(response.status).toBe(500);
  });

  it('元になったエラーをログに出す', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const cause = new DOMException('The operation timed out', 'TimeoutError');

    createInternalServerError(context, new Error('Failed query', {cause}));

    expect(log).toHaveBeenCalledWith(
      'Caused by:',
      'TimeoutError: The operation timed out',
    );
  });

  it('元になったエラーが無ければ原因の行を出さない', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    createInternalServerError(context, new Error('boom'));

    expect(log).toHaveBeenCalledTimes(1);
  });

  it('応答には内部のエラーの中身を載せない', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = createInternalServerError(
      context,
      new Error('Failed query: select secret'),
    );

    expect(await response.json()).toEqual({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    });
  });
});
