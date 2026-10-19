import {describe, expect, it, vi} from 'vitest';
import {INDEXNOW_ENDPOINT, INDEXNOW_KEY, submitIndexNow} from '../indexnow';

describe('submitIndexNow', () => {
  it('鍵と URL の一覧を IndexNow へ POST する', async () => {
    const fetchImpl = vi.fn(async () => new Response('', {status: 200}));

    await submitIndexNow(['https://shine-film.com/'], {fetchImpl});

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(INDEXNOW_ENDPOINT);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toStrictEqual({
      host: 'shine-film.com',
      key: INDEXNOW_KEY,
      keyLocation: `https://shine-film.com/${INDEXNOW_KEY}.txt`,
      urlList: ['https://shine-film.com/'],
    });
  });

  it('URL が無ければ送らない', async () => {
    const fetchImpl = vi.fn(async () => new Response('', {status: 200}));

    await submitIndexNow([], {fetchImpl});

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('受け付けられなかったら投げる', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('invalid key', {status: 422}),
    );

    await expect(
      submitIndexNow(['https://shine-film.com/'], {fetchImpl}),
    ).rejects.toThrow('422');
  });
});
