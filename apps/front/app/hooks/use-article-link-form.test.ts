import {act, renderHook} from '@testing-library/react';
import {type ChangeEvent} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  fallbackTitleFromUrl,
  fetchUrlTitle,
  TITLE_FETCH_DEBOUNCE_MS,
  useArticleLinkForm,
} from './use-article-link-form';

describe('fallbackTitleFromUrl', () => {
  it('X のポストはアカウント名からタイトルを作る', () => {
    expect(fallbackTitleFromUrl('https://x.com/dlwr/status/123')).toBe(
      '@dlwr のポスト',
    );
  });

  it('twitter.com のポストもアカウント名からタイトルを作る', () => {
    expect(fallbackTitleFromUrl('https://twitter.com/dlwr/status/123')).toBe(
      '@dlwr のポスト',
    );
  });

  it('Bluesky のポストはハンドルからタイトルを作る', () => {
    expect(
      fallbackTitleFromUrl(
        'https://bsky.app/profile/dlwr.bsky.social/post/abc',
      ),
    ).toBe('@dlwr.bsky.social のポスト');
  });

  it('Filmarks のレビューは Filmarks のレビューと題を付ける', () => {
    expect(
      fallbackTitleFromUrl(
        'https://filmarks.com/movies/75581/reviews/144397688',
      ),
    ).toBe('Filmarks のレビュー');
  });

  it('Letterboxd のレビューはアカウント名から題を作る', () => {
    expect(
      fallbackTitleFromUrl(
        'https://letterboxd.com/davidehrlich/film/45-years/',
      ),
    ).toBe('@davidehrlich の Letterboxd のレビュー');
  });

  it('X のプロフィールページはホスト名を返す', () => {
    expect(fallbackTitleFromUrl('https://x.com/dlwr')).toBe('x.com');
  });

  it('それ以外の URL はホスト名を返す', () => {
    expect(fallbackTitleFromUrl('https://example.com/blog/post-1')).toBe(
      'example.com',
    );
  });
});

describe('fetchUrlTitle', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('API が返したタイトルを返す', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({title: '記事のタイトル'})),
    );

    await expect(
      fetchUrlTitle('https://api.example', 'https://example.com/post'),
    ).resolves.toBe('記事のタイトル');
  });

  it('fetch-url-title エンドポイントへ URL を POST する', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({title: 't'}));
    vi.stubGlobal('fetch', fetchMock);

    await fetchUrlTitle('https://api.example', 'https://example.com/post');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example/fetch-url-title',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({url: 'https://example.com/post'}),
      }),
    );
  });

  it('API がエラーを返したら undefined', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ok: false}));

    await expect(
      fetchUrlTitle('https://api.example', 'https://example.com/post'),
    ).resolves.toBeUndefined();
  });

  it('タイトルが空なら undefined', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({title: ''})),
    );

    await expect(
      fetchUrlTitle('https://api.example', 'https://example.com/post'),
    ).resolves.toBeUndefined();
  });

  it('通信に失敗したら undefined', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));

    await expect(
      fetchUrlTitle('https://api.example', 'https://example.com/post'),
    ).resolves.toBeUndefined();
  });
});

const change = (name: string, value: string) =>
  ({
    target: {name, value},
  }) as ChangeEvent<HTMLInputElement>;

describe('useArticleLinkForm', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('共有で受け取った URL を最初から入れておく', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({})));

    const {result} = renderHook(() =>
      useArticleLinkForm(
        false,
        undefined,
        'https://api.example',
        'https://example.com/post',
      ),
    );

    expect(result.current.formData.url).toBe('https://example.com/post');
  });

  it('共有で受け取った URL の題名を取りに行く', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({title: '記事のタイトル'}));
    vi.stubGlobal('fetch', fetchMock);

    const {result} = renderHook(() =>
      useArticleLinkForm(
        false,
        undefined,
        'https://api.example',
        'https://example.com/post',
      ),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TITLE_FETCH_DEBOUNCE_MS);
    });

    expect(result.current.formData.title).toBe('記事のタイトル');
  });

  it('URL の入力ごとではなく、入力が止まってから 1 回だけ題名を取りに行く', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({title: '記事のタイトル'}));
    vi.stubGlobal('fetch', fetchMock);

    const {result} = renderHook(() =>
      useArticleLinkForm(false, undefined, 'https://api.example'),
    );

    for (const url of [
      'https://example.co',
      'https://example.com',
      'https://example.com/post',
    ]) {
      act(() => {
        result.current.handleInputChange(change('url', url));
      });
    }

    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(TITLE_FETCH_DEBOUNCE_MS);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].body).toBe(
      JSON.stringify({url: 'https://example.com/post'}),
    );
    expect(result.current.formData.title).toBe('記事のタイトル');
    expect(result.current.isLoadingTitle).toBe(false);
  });

  it('URL を入れた時点で URL から作った題名をすぐ入れる', () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({title: '記事のタイトル'}));
    vi.stubGlobal('fetch', fetchMock);

    const {result} = renderHook(() =>
      useArticleLinkForm(false, undefined, 'https://api.example'),
    );

    act(() => {
      result.current.handleInputChange(
        change('url', 'https://x.com/dlwr/status/123'),
      );
    });

    expect(result.current.formData.title).toBe('@dlwr のポスト');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('遅れて届いた古い URL の題名で新しい題名を上書きしない', async () => {
    const pending = new Map<string, (title: string) => void>();
    const fetchMock = vi.fn().mockImplementation(async (_, options) => {
      const {url} = JSON.parse(options.body as string) as {url: string};
      return new Promise<Response>(resolve => {
        pending.set(url, title => {
          resolve(Response.json({title}));
        });
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const {result} = renderHook(() =>
      useArticleLinkForm(false, undefined, 'https://api.example'),
    );

    for (const url of ['https://example.com/old', 'https://example.com/new']) {
      act(() => {
        result.current.handleInputChange(change('url', url));
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(TITLE_FETCH_DEBOUNCE_MS);
      });
    }

    expect(pending.size).toBe(2);

    await act(async () => {
      pending.get('https://example.com/new')!('新しい');
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      pending.get('https://example.com/old')!('古い');
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.formData.title).toBe('新しい');
  });

  it('自分で題名を書いたら取得結果で上書きしない', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({title: '取得した題名'}));
    vi.stubGlobal('fetch', fetchMock);

    const {result} = renderHook(() =>
      useArticleLinkForm(false, undefined, 'https://api.example'),
    );

    act(() => {
      result.current.handleInputChange(
        change('url', 'https://example.com/post'),
      );
      result.current.handleInputChange(change('title', '自分で書いた題名'));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TITLE_FETCH_DEBOUNCE_MS);
    });

    expect(result.current.formData.title).toBe('自分で書いた題名');
  });
});
