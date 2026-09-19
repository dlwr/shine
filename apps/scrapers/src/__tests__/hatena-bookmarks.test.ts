import {describe, expect, it, vi} from 'vitest';
import {fetchHatenaBookmarkCounts} from '../hatena-bookmarks';

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, {status});
}

describe('fetchHatenaBookmarkCounts', () => {
  it('URL ごとのブックマーク数を返す', async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        'https://shine-film.com/movies/a': 3,
        'https://shine-film.com/movies/b': 0,
      }),
    );

    const counts = await fetchHatenaBookmarkCounts(
      ['https://shine-film.com/movies/a', 'https://shine-film.com/movies/b'],
      fetcher,
    );

    expect(counts.get('https://shine-film.com/movies/a')).toBe(3);
  });

  it('URL を url パラメータの繰り返しで渡す', async () => {
    const fetcher = vi.fn(async () => jsonResponse({}));

    await fetchHatenaBookmarkCounts(
      ['https://shine-film.com/movies/a', 'https://shine-film.com/'],
      fetcher,
    );

    expect(fetcher).toHaveBeenCalledWith(
      'https://bookmark.hatenaapis.com/count/entries?url=https%3A%2F%2Fshine-film.com%2Fmovies%2Fa&url=https%3A%2F%2Fshine-film.com%2F',
      expect.anything(),
    );
  });

  it('応答に無い URL は 0 件として扱う', async () => {
    const fetcher = vi.fn(async () => jsonResponse({}));

    const counts = await fetchHatenaBookmarkCounts(
      ['https://shine-film.com/movies/a'],
      fetcher,
    );

    expect(counts.get('https://shine-film.com/movies/a')).toBe(0);
  });

  it('URL が無ければ問い合わせない', async () => {
    const fetcher = vi.fn(async () => jsonResponse({}));

    await fetchHatenaBookmarkCounts([], fetcher);

    expect(fetcher).not.toHaveBeenCalled();
  });

  it('失敗の応答は投げる', async () => {
    const fetcher = vi.fn(async () => jsonResponse({}, 503));

    await expect(
      fetchHatenaBookmarkCounts(['https://shine-film.com/'], fetcher),
    ).rejects.toThrow('503');
  });
});
