import {Hono} from 'hono';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {requestLogging} from '../middleware/request-logging';

function createApp() {
  const app = new Hono();
  app.use('*', requestLogging);
  app.get('/cached', c => {
    c.header('X-Cache-Status', 'HIT');
    return c.json({ok: true});
  });
  app.get('/plain', c => c.json({ok: true}));
  return app;
}

describe('requestLogging', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('logs method, path, status and durationMs as JSON', async () => {
    const app = createApp();
    await app.request('/plain');

    const entry = JSON.parse(logSpy.mock.calls[0][0] as string) as Record<
      string,
      unknown
    >;
    expect(entry.event).toBe('request');
    expect(entry.method).toBe('GET');
    expect(entry.path).toBe('/plain');
    expect(entry.status).toBe(200);
    expect(typeof entry.durationMs).toBe('number');
  });

  it('includes cacheStatus from the X-Cache-Status response header', async () => {
    const app = createApp();
    await app.request('/cached');

    const entry = JSON.parse(logSpy.mock.calls[0][0] as string) as Record<
      string,
      unknown
    >;
    expect(entry.cacheStatus).toBe('HIT');
  });

  it('omits cacheStatus when the response has no X-Cache-Status header', async () => {
    const app = createApp();
    await app.request('/plain');

    const entry = JSON.parse(logSpy.mock.calls[0][0] as string) as Record<
      string,
      unknown
    >;
    expect('cacheStatus' in entry).toBe(false);
  });
});
