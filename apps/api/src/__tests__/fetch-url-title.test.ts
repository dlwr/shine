import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import app from '../index';

const environment = {} as never;

const postUrl = async (url: unknown) =>
  app.request(
    '/fetch-url-title',
    {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({url}),
    },
    environment,
  );

describe('POST /fetch-url-title', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('returns the page title for an allowed URL', async () => {
    fetchMock.mockResolvedValue(
      new Response('<html><head><title>Example Article</title></head></html>', {
        status: 200,
      }),
    );

    const response = await postUrl('https://example.com/article');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({title: 'Example Article'});
  });

  it('decodes character references in the title', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        '<title>&lrm;&#8216;45 Years&#x2019; review by davidehrlich &bull; Letterboxd &amp; more</title>',
        {status: 200},
      ),
    );

    const response = await postUrl('https://letterboxd.com/x/film/45-years/');

    expect(await response.json()).toEqual({
      title: '‘45 Years’ review by davidehrlich • Letterboxd & more',
    });
  });

  it('leaves unknown named references as they are', async () => {
    fetchMock.mockResolvedValue(
      new Response('<title>A &unknown; B</title>', {status: 200}),
    );

    const response = await postUrl('https://example.com/article');

    expect(await response.json()).toEqual({title: 'A &unknown; B'});
  });

  it('rejects private addresses without fetching', async () => {
    const response = await postUrl('http://127.0.0.1/admin');

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects internal hostnames without fetching', async () => {
    const response = await postUrl('http://localhost:8787/');

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects non-http protocols without fetching', async () => {
    const response = await postUrl('file:///etc/passwd');

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects redirects to private addresses', async () => {
    fetchMock.mockResolvedValue(
      new Response(undefined, {
        status: 302,
        headers: {Location: 'http://169.254.169.254/latest/meta-data/'},
      }),
    );

    const response = await postUrl('https://example.com/redirect');

    expect(response.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('follows redirects to allowed URLs', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(undefined, {
          status: 301,
          headers: {Location: 'https://other.example.com/page'},
        }),
      )
      .mockResolvedValueOnce(
        new Response('<title>Redirected</title>', {status: 200}),
      );

    const response = await postUrl('https://example.com/old');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({title: 'Redirected'});
  });
});
