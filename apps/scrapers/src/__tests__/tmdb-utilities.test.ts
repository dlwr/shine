import {beforeEach, describe, expect, it, vi} from 'vitest';
import {
  fetchTMDBCredits,
  fetchTMDBMovieDetails,
  fetchTMDBMovieTranslations,
  findTMDBByImdbId,
  searchTMDBMovie,
} from '../common/tmdb-utilities';

vi.stubGlobal('fetch', vi.fn());

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  } as unknown as Response;
}

describe('TMDb Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchTMDBCredits', () => {
    it('日本語ロケールでクレジットを取得する', async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({id: 103, cast: [], crew: []}),
      );

      await fetchTMDBCredits(103, 'movie', 'api-key');

      const requestedUrl = vi.mocked(fetch).mock.calls[0][0] as string;
      expect(requestedUrl).toContain('/movie/103/credits');
      expect(requestedUrl).toContain('language=ja-JP');
    });

    it('テレビ作品は tv エンドポイントを使う', async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({id: 55, cast: [], crew: []}),
      );

      await fetchTMDBCredits(55, 'tv', 'api-key');

      const requestedUrl = vi.mocked(fetch).mock.calls[0][0] as string;
      expect(requestedUrl).toContain('/tv/55/credits');
    });
  });

  describe('fetchTMDBMovieDetails', () => {
    it('should return movie details', async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({
          id: 123,
          title: 'Test Movie',
          original_title: 'Test Movie',
          release_date: '2020-01-01',
        }),
      );

      const result = await fetchTMDBMovieDetails(123, 'api-key');

      expect(result?.id).toBe(123);
      expect(result?.title).toBe('Test Movie');
      const requestedUrl = vi.mocked(fetch).mock.calls[0][0] as string;
      expect(requestedUrl).toContain('/movie/123');
      expect(requestedUrl).toContain('api_key=api-key');
    });

    it('should retry on transient 5xx errors', async () => {
      vi.useFakeTimers();

      vi.mocked(fetch)
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
        } as unknown as Response)
        .mockResolvedValueOnce(
          jsonResponse({
            id: 123,
            title: 'Test Movie',
            original_title: 'Test Movie',
            release_date: '2020-01-01',
          }),
        );

      const promise = fetchTMDBMovieDetails(123, 'api-key');
      await vi.runAllTimersAsync();
      const result = await promise;
      vi.useRealTimers();

      expect(fetch).toHaveBeenCalledTimes(2);
      expect(result?.id).toBe(123);
    });

    it('should return undefined on non-retryable errors', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 404,
      } as unknown as Response);

      const result = await fetchTMDBMovieDetails(123, 'api-key');

      expect(result).toBeUndefined();
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('fetchTMDBMovieTranslations', () => {
    it('should return translations', async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({
          id: 123,
          translations: [
            {
              iso_3166_1: 'JP',
              iso_639_1: 'ja',
              name: '日本語',
              english_name: 'Japanese',
              data: {title: 'テスト映画'},
            },
          ],
        }),
      );

      const result = await fetchTMDBMovieTranslations(123, 'api-key');

      expect(result?.translations[0].data.title).toBe('テスト映画');
      const requestedUrl = vi.mocked(fetch).mock.calls[0][0] as string;
      expect(requestedUrl).toContain('/movie/123/translations');
    });
  });

  describe('searchTMDBMovie', () => {
    it('should return the matched movie id', async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({
          results: [{id: 42, title: 'Test Movie', release_date: '2020-05-01'}],
        }),
      );

      const result = await searchTMDBMovie('Test Movie', 2020, 'api-key');

      expect(result).toBe(42);
    });

    it('should return undefined when no results match', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({results: []}));

      const result = await searchTMDBMovie('Unknown', 2020, 'api-key');

      expect(result).toBeUndefined();
    });
  });

  describe('findTMDBByImdbId', () => {
    it('should return movie result', async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({
          movie_results: [
            {
              id: 99,
              title: 'Found Movie',
              original_title: 'Found Movie',
              release_date: '2019-01-01',
            },
          ],
          tv_results: [],
        }),
      );

      const result = await findTMDBByImdbId('tt1234567', 'api-key');

      expect(result).toEqual({tmdbId: 99, mediaType: 'movie'});
      const requestedUrl = vi.mocked(fetch).mock.calls[0][0] as string;
      expect(requestedUrl).toContain('/find/tt1234567');
      expect(requestedUrl).toContain('external_source=imdb_id');
    });

    it('should return tv result when no movie matches', async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({
          movie_results: [],
          tv_results: [
            {
              id: 55,
              name: 'Found Show',
              original_name: 'Found Show',
              first_air_date: '2018-01-01',
            },
          ],
        }),
      );

      const result = await findTMDBByImdbId('tt7654321', 'api-key');

      expect(result).toEqual({tmdbId: 55, mediaType: 'tv'});
    });
  });
});
