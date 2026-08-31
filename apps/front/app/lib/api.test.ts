import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {apiFetch, createEnvironmentContext} from './api';

describe('apiFetch', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('fetches via PUBLIC_API_URL when no binding is present', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    const context = createEnvironmentContext({
      PUBLIC_API_URL: 'https://api.example',
    });

    await apiFetch(context, '/movies/1?locale=ja');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example/movies/1?locale=ja',
      undefined,
    );
  });

  it('prefers the API service binding when present', async () => {
    const bindingFetch = vi.fn().mockResolvedValue(new Response('{}'));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const context = createEnvironmentContext({
      PUBLIC_API_URL: 'https://api.example',
      API: {fetch: bindingFetch},
    });

    await apiFetch(context, '/movies/1');

    expect(bindingFetch).toHaveBeenCalledWith(
      'https://shine-api/movies/1',
      undefined,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passes the init through', async () => {
    const bindingFetch = vi.fn().mockResolvedValue(new Response('{}'));
    const context = createEnvironmentContext({API: {fetch: bindingFetch}});

    await apiFetch(context, '/auth/login', {method: 'POST'});

    expect(bindingFetch).toHaveBeenCalledWith('https://shine-api/auth/login', {
      method: 'POST',
    });
  });

  it('logs path without query, status, via and durationMs', async () => {
    const bindingFetch = vi
      .fn()
      .mockResolvedValue(new Response('{}', {status: 200}));
    const context = createEnvironmentContext({API: {fetch: bindingFetch}});

    await apiFetch(context, '/people/xyz?locale=en');

    const entry = JSON.parse(logSpy.mock.calls[0][0] as string) as Record<
      string,
      unknown
    >;
    expect(entry.event).toBe('api_fetch');
    expect(entry.path).toBe('/people/xyz');
    expect(entry.status).toBe(200);
    expect(entry.via).toBe('binding');
    expect(typeof entry.durationMs).toBe('number');
  });
});
