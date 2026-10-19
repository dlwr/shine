import {INDEXNOW_ENDPOINT} from '@shine/utils/indexnow';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {notifyIndexNowMovieChanged} from '../indexnow';

describe('notifyIndexNowMovieChanged', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('映画ページの URL を IndexNow へ送る', async () => {
    const fetchImpl = vi.fn(async () => new Response('', {status: 200}));

    await notifyIndexNowMovieChanged('test-key', 'movie-1', fetchImpl);

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(INDEXNOW_ENDPOINT);
    expect(JSON.parse(init.body as string)).toMatchObject({
      key: 'test-key',
      keyLocation: 'https://shine-film.com/test-key.txt',
      urlList: ['https://shine-film.com/movies/movie-1'],
    });
  });

  it('受け付けられなくてもログを出すだけで投げない', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchImpl = vi.fn(async () => new Response('bad', {status: 422}));

    await expect(
      notifyIndexNowMovieChanged('test-key', 'movie-1', fetchImpl),
    ).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledOnce();
  });

  it('通信に失敗してもログを出すだけで投げない', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });

    await expect(
      notifyIndexNowMovieChanged('test-key', 'movie-1', fetchImpl),
    ).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledOnce();
  });
});
