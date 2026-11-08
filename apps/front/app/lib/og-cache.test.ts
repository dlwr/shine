import {describe, expect, it, vi} from 'vitest';
import {serveOgWithCache} from './og-cache';

class MemoryCache {
  readonly entries = new Map<string, Response>();

  async match(request: Request): Promise<Response | undefined> {
    return this.entries.get(request.url)?.clone();
  }

  async put(request: Request, response: Response): Promise<void> {
    this.entries.set(request.url, response);
  }
}

const URL_PERSON = 'https://shine-film.com/og/person.png?id=abc';

function png(cacheControl: string, status = 200): Response {
  return new Response('png', {
    status,
    headers: {'Content-Type': 'image/png', 'Cache-Control': cacheControl},
  });
}

async function serve(
  cache: MemoryCache,
  render: (request: Request) => Promise<Response>,
  request = new Request(URL_PERSON),
) {
  const pending: Array<Promise<unknown>> = [];
  const response = await serveOgWithCache(
    request,
    render,
    cache as unknown as Cache,
    promise => {
      pending.push(promise);
    },
  );
  await Promise.all(pending);
  return response;
}

describe('serveOgWithCache', () => {
  it('2 回目は描画せずキャッシュから返す', async () => {
    const cache = new MemoryCache();
    const render = vi.fn(async () => png('public, max-age=86400'));

    const first = await serve(cache, render);
    const second = await serve(cache, render);

    expect(render).toHaveBeenCalledTimes(1);
    expect(await first.text()).toBe('png');
    expect(await second.text()).toBe('png');
    expect(second.headers.get('Content-Type')).toBe('image/png');
  });

  it('クエリが違えば別の画像として描画する', async () => {
    const cache = new MemoryCache();
    const render = vi.fn(async () => png('public, max-age=86400'));

    await serve(cache, render);
    await serve(
      cache,
      render,
      new Request('https://shine-film.com/og/person.png?id=def'),
    );

    expect(render).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['失敗した応答', png('public, max-age=86400', 503)],
    ['no-store の応答', png('no-store')],
    ['Cache-Control の無い応答', new Response('png')],
  ])('%sは置かない', async (_label, response) => {
    const cache = new MemoryCache();

    await serve(cache, async () => response.clone());

    expect(cache.entries.size).toBe(0);
  });

  it('GET 以外はキャッシュを見ずに描画へ渡す', async () => {
    const cache = new MemoryCache();
    const render = vi.fn(async () => png('public, max-age=86400'));
    const head = new Request(URL_PERSON, {method: 'HEAD'});

    await serve(cache, render, head);
    await serve(cache, render, head);

    expect(render).toHaveBeenCalledTimes(2);
    expect(cache.entries.size).toBe(0);
  });
});
