import {afterEach, describe, expect, it, vi} from 'vitest';
import type {Route} from './+types/share';
import {loader} from './share';
import {createEnvironmentContext} from '@/lib/api';

const context = createEnvironmentContext({
  PUBLIC_API_URL: 'https://api.example',
});

function runLoader(query: string): Promise<Response> {
  return loader({
    context,
    request: new Request(`https://shine-film.com/share${query}`),
    params: {},
    matches: [],
  } as unknown as Route.LoaderArgs);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('/share', () => {
  it('共有された URL を今月の1本の投稿欄に入れて開く', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({monthly: {uid: 'm1'}})),
    );

    const response = await runLoader('?url=https%3A%2F%2Fexample.com%2Fpost');

    expect(response.headers.get('Location')).toBe(
      '/movies/m1?link=https%3A%2F%2Fexample.com%2Fpost#article-links',
    );
  });

  it('URL が無ければ投稿欄だけ開く', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({monthly: {uid: 'm1'}})),
    );

    const response = await runLoader('?text=%E8%A6%B3%E3%81%9F');

    expect(response.headers.get('Location')).toBe('/movies/m1#article-links');
  });

  it('転送を残さない', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({monthly: {uid: 'm1'}})),
    );

    const response = await runLoader('?url=https%3A%2F%2Fexample.com%2Fpost');

    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('選出が取れなければアーカイブへ逃がす', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));

    const response = await runLoader('?url=https%3A%2F%2Fexample.com%2Fpost');

    expect(response.headers.get('Location')).toBe('/monthly');
  });
});
