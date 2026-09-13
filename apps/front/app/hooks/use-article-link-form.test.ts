import {afterEach, describe, expect, it, vi} from 'vitest';
import {fallbackTitleFromUrl, fetchUrlTitle} from './use-article-link-form';

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
