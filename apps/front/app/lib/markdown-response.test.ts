import {describe, expect, it, vi} from 'vitest';
import {
  htmlToMarkdownWith,
  serveMarkdown,
  prefersMarkdown,
  withMarkdownAlternate,
} from './markdown-response';

class MemoryCache {
  readonly entries = new Map<string, Response>();

  async match(request: Request): Promise<Response | undefined> {
    return this.entries.get(request.url)?.clone();
  }

  async put(request: Request, response: Response): Promise<void> {
    this.entries.set(request.url, response);
  }
}

const PAGE_URL = 'https://shine-film.com/movies/abc';

function markdownRequest(url = PAGE_URL, headers: HeadersInit = {}) {
  return new Request(url, {headers: {Accept: 'text/markdown', ...headers}});
}

function html(
  body = '<h1>題名</h1>',
  init: ResponseInit = {},
  contentType = 'text/html; charset=utf-8',
): Response {
  return new Response(body, {
    status: 200,
    ...init,
    headers: {
      'Content-Type': contentType,
      Vary: 'Accept-Language',
      ...init.headers,
    },
  });
}

async function serve({
  request = markdownRequest(),
  render = async () => html(),
  convert = async (source: string) => `# ${source.length}`,
  cache = new MemoryCache(),
}: {
  request?: Request;
  render?: (request: Request) => Promise<Response>;
  convert?: (html: string, url: string) => Promise<string | undefined>;
  cache?: MemoryCache;
} = {}) {
  const pending: Array<Promise<unknown>> = [];
  const response = await serveMarkdown(request, {
    render,
    convert,
    cache: cache as unknown as Cache,
    waitUntil(promise) {
      pending.push(promise);
    },
  });
  await Promise.all(pending);
  return response;
}

describe('prefersMarkdown', () => {
  it('Accept に text/markdown を含む GET を Markdown の要求とみなす', () => {
    expect(
      prefersMarkdown(
        markdownRequest(PAGE_URL, {Accept: 'text/markdown, */*'}),
      ),
    ).toBe(true);
  });

  it('Accept が HTML だけの GET は Markdown の要求とみなさない', () => {
    expect(
      prefersMarkdown(new Request(PAGE_URL, {headers: {Accept: 'text/html'}})),
    ).toBe(false);
  });

  it('GET 以外は Markdown の要求とみなさない', () => {
    expect(
      prefersMarkdown(
        new Request(PAGE_URL, {
          method: 'POST',
          headers: {Accept: 'text/markdown'},
        }),
      ),
    ).toBe(false);
  });

  it('管理画面は Markdown の要求とみなさない', () => {
    expect(
      prefersMarkdown(markdownRequest('https://shine-film.com/admin/movies')),
    ).toBe(false);
  });
});

describe('serveMarkdown', () => {
  it('HTML を変換した Markdown を text/markdown で返す', async () => {
    const response = await serve({convert: async () => '# 題名'});

    expect(response.headers.get('Content-Type')).toBe(
      'text/markdown; charset=utf-8',
    );
  });

  it('変換した Markdown を本文にする', async () => {
    const response = await serve({convert: async () => '# 題名'});

    expect(await response.text()).toBe('# 題名');
  });

  it('変換には HTML の本文とページの URL を渡す', async () => {
    const convert = vi.fn(async () => '# 題名');
    await serve({convert});

    expect(convert).toHaveBeenCalledWith('<h1>題名</h1>', PAGE_URL);
  });

  it('描画には HTML を求める Accept で渡す', async () => {
    const render = vi.fn(async (request: Request) => html(request.url));
    await serve({render});

    expect(render.mock.calls[0][0].headers.get('Accept')).toBe('text/html');
  });

  it('Markdown の応答の Vary に Accept と Accept-Language を入れる', async () => {
    const response = await serve();

    expect(response.headers.get('Vary')).toBe('Accept-Language, Accept');
  });

  it('変換できなかったときは HTML をそのまま返す', async () => {
    const response = await serve({
      convert: htmlToMarkdownWith(fakeAi({format: 'error', error: 'failed'})),
    });

    expect(await response.text()).toBe('<h1>題名</h1>');
  });

  it('HTML のまま返すときも Vary に Accept を足す', async () => {
    const response = await serve({
      convert: htmlToMarkdownWith(fakeAi({format: 'error', error: 'failed'})),
    });

    expect(response.headers.get('Vary')).toBe('Accept-Language, Accept');
  });

  it('200 以外の応答は変換しない', async () => {
    const convert = vi.fn(async () => '# 題名');
    const response = await serve({
      render: async () => html('<h1>見つかりません</h1>', {status: 404}),
      convert,
    });

    expect([response.status, convert.mock.calls.length]).toEqual([404, 0]);
  });

  it('HTML でない応答は変換しない', async () => {
    const convert = vi.fn(async () => '# 題名');
    await serve({
      render: async () => html('<urlset/>', {}, 'application/xml'),
      convert,
    });

    expect(convert).not.toHaveBeenCalled();
  });

  it('同じ URL とロケールの 2 回目は変換を繰り返さない', async () => {
    const cache = new MemoryCache();
    const convert = vi.fn(async () => '# 題名');
    await serve({cache, convert});
    await serve({cache, convert});

    expect(convert).toHaveBeenCalledTimes(1);
  });

  it('ロケールが違えば別に変換する', async () => {
    const cache = new MemoryCache();
    const convert = vi.fn(async () => '# 題名');
    await serve({cache, convert});
    await serve({
      cache,
      convert,
      request: markdownRequest(PAGE_URL, {'Accept-Language': 'en'}),
    });

    expect(convert).toHaveBeenCalledTimes(2);
  });

  it('Markdown は 1 時間キャッシュする', async () => {
    const cache = new MemoryCache();
    await serve({cache});

    expect(
      cache.entries.values().toArray()[0].headers.get('Cache-Control'),
    ).toBe('public, max-age=3600');
  });

  it('Cookie を設定する応答の Markdown はキャッシュしない', async () => {
    const cache = new MemoryCache();
    await serve({
      cache,
      render: async () =>
        html('<h1>題名</h1>', {headers: {'Set-Cookie': 'a=b'}}),
    });

    expect(cache.entries.size).toBe(0);
  });
});

describe('withMarkdownAlternate', () => {
  const htmlRequest = new Request(PAGE_URL);

  it('HTML の応答の Link にそのページの Markdown 版を足す', () => {
    const response = withMarkdownAlternate(htmlRequest, html());

    expect(response.headers.get('Link')).toBe(
      `<${PAGE_URL}>; rel="alternate"; type="text/markdown"`,
    );
  });

  it('既存の Link は残して足す', () => {
    const response = withMarkdownAlternate(
      htmlRequest,
      html('', {headers: {Link: '</a.css>; rel="preload"'}}),
    );

    expect(response.headers.get('Link')).toBe(
      `</a.css>; rel="preload", <${PAGE_URL}>; rel="alternate"; type="text/markdown"`,
    );
  });

  it('HTML の応答の Vary に Accept を足し、Accept-Language は残す', () => {
    const response = withMarkdownAlternate(htmlRequest, html());

    expect(response.headers.get('Vary')).toBe('Accept-Language, Accept');
  });

  it('200 以外の応答には足さない', () => {
    const response = withMarkdownAlternate(
      htmlRequest,
      html('', {status: 404}),
    );

    expect(response.headers.get('Link')).toBeNull();
  });

  it('HTML でない応答には足さない', () => {
    const response = withMarkdownAlternate(
      htmlRequest,
      html('', {}, 'application/xml'),
    );

    expect(response.headers.get('Link')).toBeNull();
  });

  it('管理画面の応答には足さない', () => {
    const response = withMarkdownAlternate(
      new Request('https://shine-film.com/admin'),
      html(),
    );

    expect(response.headers.get('Link')).toBeNull();
  });
});

function fakeAi(
  result: {format: 'markdown'; data: string} | {format: 'error'; error: string},
) {
  const response = {
    id: 'id',
    name: 'page.html',
    mimeType: 'text/html',
    tokens: 1,
    ...result,
  };
  return {
    toMarkdown: vi.fn(async (): Promise<ConversionResponse> => response),
  };
}

describe('htmlToMarkdownWith', () => {
  it('Workers AI の変換結果の Markdown を返す', async () => {
    const ai = fakeAi({format: 'markdown', data: '# 題名'});

    expect(await htmlToMarkdownWith(ai)('<h1>題名</h1>', PAGE_URL)).toBe(
      '# 題名',
    );
  });

  it('リンクの解決のためにページの URL を hostname に渡す', async () => {
    const ai = fakeAi({format: 'markdown', data: '# 題名'});
    await htmlToMarkdownWith(ai)('<h1>題名</h1>', PAGE_URL);

    expect(ai.toMarkdown).toHaveBeenCalledWith(expect.anything(), {
      conversionOptions: {html: {hostname: PAGE_URL}},
    });
  });

  it('変換結果が error なら undefined を返す', async () => {
    const ai = fakeAi({format: 'error', error: 'failed'});

    expect(
      await htmlToMarkdownWith(ai)('<h1>題名</h1>', PAGE_URL),
    ).toBeUndefined();
  });

  it('変換で例外が出たら undefined を返す', async () => {
    const ai = {
      toMarkdown: vi.fn(async () => {
        throw new Error('down');
      }),
    };

    expect(
      await htmlToMarkdownWith(ai)('<h1>題名</h1>', PAGE_URL),
    ).toBeUndefined();
  });
});
