import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import app from '../index';

const environment = {} as never;

let ipCounter = 0;

const postUrl = async (
  url: unknown,
  options: {ip?: string; environment?: unknown} = {},
) =>
  app.request(
    '/fetch-url-title',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'cf-connecting-ip': options.ip ?? `ip-${++ipCounter}`,
      },
      body: JSON.stringify({url}),
    },
    (options.environment ?? environment) as never,
  );

function countingBody(
  chunk: string,
  chunks: number,
): {body: ReadableStream<Uint8Array>; reads: () => number} {
  let read = 0;
  const encoded = new TextEncoder().encode(chunk);
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        if (read >= chunks) {
          controller.close();
          return;
        }

        read++;
        controller.enqueue(encoded);
      },
    },
    {highWaterMark: 0},
  );

  return {body, reads: () => read};
}

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

  it('レート制限の binding が拒否したら外部へ取りに行かない', async () => {
    const limit = vi.fn().mockResolvedValue({success: false});

    const response = await postUrl('https://example.com/article', {
      ip: 'limited-ip',
      environment: {TITLE_RATE_LIMITER: {limit}},
    });

    expect(response.status).toBe(429);
    expect(limit).toHaveBeenCalledWith({key: 'limited-ip'});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('同じ IP からの連打は 429 で止める', async () => {
    fetchMock.mockImplementation(
      () => new Response('<title>Example</title>', {status: 200}),
    );

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 61; attempt++) {
      const response = await postUrl('https://example.com/article', {
        ip: 'flooding-ip',
      });
      statuses.push(response.status);
    }

    expect(statuses.slice(0, 60)).toEqual(Array.from({length: 60}, () => 200));
    expect(statuses.at(-1)).toBe(429);
  });

  it('マークアップでない応答は本文を読まない', async () => {
    const {body, reads} = countingBody('<title>PDF</title>', 1);
    fetchMock.mockResolvedValue(
      new Response(body, {
        status: 200,
        headers: {'content-type': 'application/pdf'},
      }),
    );

    const response = await postUrl('https://example.com/paper.pdf');

    expect(response.status).toBe(400);
    expect(reads()).toBe(0);
  });

  it('タイトルが読めた時点で本文の読み込みを打ち切る', async () => {
    const {body, reads} = countingBody('<title>Example</title>', 1000);
    fetchMock.mockResolvedValue(
      new Response(body, {
        status: 200,
        headers: {'content-type': 'text/html'},
      }),
    );

    const response = await postUrl('https://example.com/article');

    expect(await response.json()).toEqual({title: 'Example'});
    expect(reads()).toBe(1);
  });

  it('タイトルの無い長い本文は上限で打ち切る', async () => {
    const {body, reads} = countingBody('x'.repeat(64 * 1024), 1000);
    fetchMock.mockResolvedValue(
      new Response(body, {
        status: 200,
        headers: {'content-type': 'text/html'},
      }),
    );

    const response = await postUrl('https://example.com/huge');

    expect(response.status).toBe(400);
    expect(reads()).toBe(4);
  });
});
