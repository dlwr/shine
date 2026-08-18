import {renderHook, waitFor} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {useOnDemandAvailability} from './use-on-demand-availability';

vi.stubGlobal('fetch', vi.fn());

describe('useOnDemandAvailability', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('初期データが空ならチェックAPIをPOSTして結果を反映する', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        available: true,
        availability: [
          {source: 'unext', detail: 'Matched: 落下の解剖学', checkedAt: 1},
        ],
      }),
    } as Response);

    const {result} = renderHook(() =>
      useOnDemandAvailability({
        movieUid: 'movie-a',
        apiUrl: 'http://localhost:8787',
        initial: [],
      }),
    );

    expect(result.current.checking).toBe(true);

    await waitFor(() => {
      expect(result.current.checking).toBe(false);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8787/movies/movie-a/availability/check',
      {method: 'POST'},
    );
    expect(result.current.availability).toHaveLength(1);
    expect(result.current.availability[0]?.source).toBe('unext');
  });

  it('初期データがあればAPIを呼ばない', () => {
    const mockFetch = vi.mocked(fetch);

    const {result} = renderHook(() =>
      useOnDemandAvailability({
        movieUid: 'movie-a',
        apiUrl: 'http://localhost:8787',
        initial: [{source: 'tmdb', detail: 'U-NEXT(見放題)', checkedAt: 1}],
      }),
    );

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.checking).toBe(false);
    expect(result.current.availability[0]?.source).toBe('tmdb');
  });

  it('movieUidが空ならAPIを呼ばずchecking=falseになる', () => {
    const mockFetch = vi.mocked(fetch);

    const {result} = renderHook(() =>
      useOnDemandAvailability({
        movieUid: '',
        apiUrl: 'http://localhost:8787',
        initial: [],
      }),
    );

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.checking).toBe(false);
  });

  it('APIが失敗してもchecking=falseで空のまま終わる', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const {result} = renderHook(() =>
      useOnDemandAvailability({
        movieUid: 'movie-a',
        apiUrl: 'http://localhost:8787',
        initial: [],
      }),
    );

    await waitFor(() => {
      expect(result.current.checking).toBe(false);
    });

    expect(result.current.availability).toHaveLength(0);
  });
});
