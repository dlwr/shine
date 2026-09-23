import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  apiFetch,
  createEnvironmentContext,
  loadApiJson,
  tryApiJson,
} from './api';

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

  it('forwards the visitor IP as x-real-ip through the binding', async () => {
    const bindingFetch = vi.fn().mockResolvedValue(new Response('{}'));
    const context = createEnvironmentContext(
      {API: {fetch: bindingFetch}},
      new Request('https://shine-film.com/movies/1', {
        headers: {'cf-connecting-ip': '203.0.113.9'},
      }),
    );

    await apiFetch(context, '/movies/1/article-links', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
    });

    const [, init] = bindingFetch.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get('x-real-ip')).toBe('203.0.113.9');
    expect(headers.get('content-type')).toBe('application/json');
    expect(init.method).toBe('POST');
  });

  it('does not forward the visitor IP to PUBLIC_API_URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    const context = createEnvironmentContext(
      {PUBLIC_API_URL: 'https://api.example'},
      new Request('https://shine-film.com/movies/1', {
        headers: {'cf-connecting-ip': '203.0.113.9'},
      }),
    );

    await apiFetch(context, '/movies/1');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example/movies/1',
      undefined,
    );
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

function stubResponse(response: Response) {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
  return createEnvironmentContext({PUBLIC_API_URL: 'https://api.example'});
}

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error;
  }
}

describe('loadApiJson', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('成功したら JSON を返す', async () => {
    const context = stubResponse(Response.json({awards: [1]}));

    await expect(
      loadApiJson<{awards: number[]}>(context, '/awards', {label: 'awards'}),
    ).resolves.toEqual({awards: [1]});
  });

  it('404 は 404 の Response を投げる', async () => {
    const context = stubResponse(new Response('', {status: 404}));

    await expect(
      loadApiJson(context, '/awards/x', {label: 'award'}),
    ).rejects.toMatchObject({status: 404});
  });

  it('他の失敗は label 入りの 502 を投げる', async () => {
    const context = stubResponse(new Response('', {status: 500}));
    const thrown = await rejectionOf(
      loadApiJson(context, '/awards', {label: 'awards'}),
    );

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(502);
    await expect((thrown as Response).text()).resolves.toBe(
      'Failed to load awards',
    );
  });

  it('signal と headers を fetch に渡す', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({}));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.stubGlobal('fetch', fetchMock);
    const context = createEnvironmentContext({
      PUBLIC_API_URL: 'https://api.example',
    });
    const controller = new AbortController();

    await loadApiJson(context, '/quiz/answer', {
      label: 'answer',
      signal: controller.signal,
      headers: {'X-Quiz-Key': 'k'},
    });

    expect(fetchMock).toHaveBeenCalledWith('https://api.example/quiz/answer', {
      signal: controller.signal,
      headers: {'X-Quiz-Key': 'k'},
    });
  });
});

describe('tryApiJson', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('成功したら JSON を返す', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({n: 1})));
    const context = createEnvironmentContext({
      PUBLIC_API_URL: 'https://api.example',
    });

    await expect(tryApiJson<{n: number}>(context, '/x')).resolves.toEqual({
      n: 1,
    });
  });

  it('失敗したら undefined を返す', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('', {status: 503})),
    );
    const context = createEnvironmentContext({
      PUBLIC_API_URL: 'https://api.example',
    });

    await expect(tryApiJson(context, '/x')).resolves.toBeUndefined();
  });
});
