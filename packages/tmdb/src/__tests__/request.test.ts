import {beforeEach, describe, expect, it, vi} from 'vitest';
import {FetchHttpError} from '@shine/utils/fetch';
import {isTmdbNotFound, tmdbGet} from '../request';

vi.stubGlobal('fetch', vi.fn());

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  } as unknown as Response;
}

describe('tmdbGet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('TMDb の v3 エンドポイントに api_key を付けて GET する', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({id: 1}));

    await tmdbGet('movie/1', 'api-key');

    const requestedUrl = new URL(vi.mocked(fetch).mock.calls[0][0] as string);
    expect(requestedUrl.origin + requestedUrl.pathname).toBe(
      'https://api.themoviedb.org/3/movie/1',
    );
    expect(requestedUrl.searchParams.get('api_key')).toBe('api-key');
  });

  it('クエリパラメータをそのまま付ける', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({results: []}));

    await tmdbGet('search/movie', 'api-key', {
      query: 'Shall we ダンス?',
      year: '1996',
    });

    const requestedUrl = new URL(vi.mocked(fetch).mock.calls[0][0] as string);
    expect(requestedUrl.searchParams.get('query')).toBe('Shall we ダンス?');
    expect(requestedUrl.searchParams.get('year')).toBe('1996');
  });

  it('JSON を返す', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({id: 7, title: 'x'}));

    await expect(tmdbGet('movie/7', 'api-key')).resolves.toEqual({
      id: 7,
      title: 'x',
    });
  });

  it('404 は FetchHttpError として投げ、isTmdbNotFound で見分けられる', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Headers(),
    } as unknown as Response);

    let error: unknown;
    try {
      await tmdbGet('movie/404', 'api-key');
    } catch (error_) {
      error = error_;
    }

    expect(error).toBeInstanceOf(FetchHttpError);
    expect(isTmdbNotFound(error)).toBe(true);
    expect(isTmdbNotFound(new Error('other'))).toBe(false);
  });
});
