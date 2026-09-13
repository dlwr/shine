import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  buildSelectionPath,
  createSelectionCacheKey,
  fetchHighlightedMovies,
  getLocalizedMovieTitle,
  selectionRequestHeaders,
} from './home';

describe('createSelectionCacheKey', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('年-月-日をゼロ埋めなしで返す', () => {
    vi.setSystemTime(new Date(2026, 8, 4, 12, 0, 0));

    expect(createSelectionCacheKey()).toBe('2026-9-4');
  });

  it('6時より前は前日の日付を返す', () => {
    vi.setSystemTime(new Date(2026, 8, 4, 5, 59, 0));

    expect(createSelectionCacheKey()).toBe('2026-9-3');
  });

  it('6時ちょうどは当日の日付を返す', () => {
    vi.setSystemTime(new Date(2026, 8, 4, 6, 0, 0));

    expect(createSelectionCacheKey()).toBe('2026-9-4');
  });

  it('月初の6時前は前月の末日を返す', () => {
    vi.setSystemTime(new Date(2026, 2, 1, 3, 0, 0));

    expect(createSelectionCacheKey()).toBe('2026-2-28');
  });
});

describe('getLocalizedMovieTitle', () => {
  it('title があればそのまま返す', () => {
    expect(getLocalizedMovieTitle({uid: 'm1', title: '七人の侍'}, 'ja')).toBe(
      '七人の侍',
    );
  });

  it('ロケールに合う翻訳を返す', () => {
    expect(
      getLocalizedMovieTitle(
        {
          uid: 'm1',
          translations: [
            {languageCode: 'en', content: 'Seven Samurai', isDefault: 1},
            {languageCode: 'ja', content: '七人の侍', isDefault: 0},
          ],
        },
        'ja',
      ),
    ).toBe('七人の侍');
  });

  it('日本語でタイトルが無ければ「タイトル不明」を返す', () => {
    expect(getLocalizedMovieTitle({uid: 'm1'}, 'ja')).toBe('タイトル不明');
  });

  it('英語でタイトルが無ければ「Untitled」を返す', () => {
    expect(getLocalizedMovieTitle({uid: 'm1'}, 'en')).toBe('Untitled');
  });
});

describe('buildSelectionPath', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 4, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('キャッシュキーとロケールをクエリに入れる', () => {
    expect(buildSelectionPath('ja')).toBe('/?cache=2026-9-4&locale=ja');
  });
});

describe('selectionRequestHeaders', () => {
  it('日本語では ja を優先する Accept-Language を付ける', () => {
    expect(selectionRequestHeaders('ja')).toEqual({
      'Cache-Control': 'no-store',
      'Accept-Language': 'ja,en;q=0.5',
    });
  });

  it('英語では en の Accept-Language を付ける', () => {
    expect(selectionRequestHeaders('en')).toEqual({
      'Cache-Control': 'no-store',
      'Accept-Language': 'en',
    });
  });
});

describe('fetchHighlightedMovies', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('API のトップをキャッシュキー付きで取得して返す', async () => {
    const movies = {daily: {uid: 'm1', title: 'テスト映画'}};
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => movies,
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchHighlightedMovies('http://localhost:8787', 'ja'),
    ).resolves.toEqual(movies);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/^http:\/\/localhost:8787\/\?cache=.*&locale=ja$/),
      {
        headers: {
          'Cache-Control': 'no-store',
          'Accept-Language': 'ja,en;q=0.5',
        },
      },
    );
  });

  it('レスポンスが ok でなければステータス付きで投げる', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ok: false, status: 503}));

    await expect(
      fetchHighlightedMovies('http://localhost:8787', 'en'),
    ).rejects.toThrow('API request failed: 503');
  });
});
