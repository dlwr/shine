import {afterEach, describe, expect, it, vi} from 'vitest';
import {buildOAuth1Header, percentEncode, postTweet} from './x';

describe('percentEncode', () => {
  it('RFC 3986の未予約文字はそのまま残す', () => {
    expect(percentEncode('Abc123-._~')).toBe('Abc123-._~');
  });

  it('スペースや記号をエンコードする', () => {
    expect(percentEncode('Hello Ladies + Gentlemen!')).toBe(
      'Hello%20Ladies%20%2B%20Gentlemen%21',
    );
  });

  it('日本語をUTF-8でエンコードする', () => {
    expect(percentEncode('あ')).toBe('%E3%81%82');
  });
});

describe('buildOAuth1Header', () => {
  it('Twitter公式ドキュメントのテストベクトルと一致する署名を生成する', () => {
    const header = buildOAuth1Header({
      method: 'POST',
      url: 'https://api.twitter.com/1.1/statuses/update.json',
      consumerKey: 'xvz1evFS4wEEPTGEFPHBog',
      consumerSecret: 'kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw',
      accessToken: '370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb',
      accessTokenSecret: 'LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE',
      nonce: 'kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg',
      timestamp: 1_318_622_958,
      extraParams: {
        status: 'Hello Ladies + Gentlemen, a signed OAuth request!',
        include_entities: 'true',
      },
    });

    expect(header).toContain(
      'oauth_signature="hCtSmYh%2BiHYCEqBWrE7C7hYmtUk%3D"',
    );
  });

  it('OAuth認証ヘッダーの形式で返す', () => {
    const header = buildOAuth1Header({
      method: 'POST',
      url: 'https://api.x.com/2/tweets',
      consumerKey: 'ck',
      consumerSecret: 'cs',
      accessToken: 'at',
      accessTokenSecret: 'ats',
      nonce: 'nonce',
      timestamp: 1_700_000_000,
    });

    expect(header).toMatch(/^OAuth /);
    expect(header).toContain('oauth_consumer_key="ck"');
    expect(header).toContain('oauth_token="at"');
    expect(header).toContain('oauth_signature_method="HMAC-SHA1"');
    expect(header).toContain('oauth_version="1.0"');
    expect(header).toContain('oauth_timestamp="1700000000"');
  });
});

const nonceOf = (call: unknown[]) =>
  /oauth_nonce="([^"]+)"/.exec(
    (call[1] as {headers: Record<string, string>}).headers.Authorization,
  )?.[1];

describe('postTweet', () => {
  const credentials = {
    consumerKey: 'ck',
    consumerSecret: 'cs',
    accessToken: 'at',
    accessTokenSecret: 'ats',
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('5xx が返ったら待って再試行する', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({title: 'Service Unavailable'}, {status: 503}),
      )
      .mockResolvedValueOnce(Response.json({data: {id: '123'}}, {status: 201}));
    vi.stubGlobal('fetch', fetchMock);

    const result = postTweet(credentials, '本文');
    await vi.runAllTimersAsync();

    await expect(result).resolves.toEqual({id: '123'});
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('再試行では署名の nonce を作り直す', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({title: 'Service Unavailable'}, {status: 503}),
      )
      .mockResolvedValueOnce(Response.json({data: {id: '123'}}, {status: 201}));
    vi.stubGlobal('fetch', fetchMock);

    const result = postTweet(credentials, '本文');
    await vi.runAllTimersAsync();
    await result;

    expect(nonceOf(fetchMock.mock.calls[1])).not.toBe(
      nonceOf(fetchMock.mock.calls[0]),
    );
  });

  it('5xx が続けば 3 回目で諦めて本文つきで失敗する', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockImplementation(async () =>
        Response.json({title: 'Service Unavailable'}, {status: 503}),
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = postTweet(credentials, '本文');
    const assertion = expect(result).rejects.toThrow(
      'X API /2/tweets failed: 503 {"title":"Service Unavailable"}',
    );
    await vi.runAllTimersAsync();

    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('4xx は再試行しない', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({title: 'Forbidden'}, {status: 403}));
    vi.stubGlobal('fetch', fetchMock);

    await expect(postTweet(credentials, '本文')).rejects.toThrow('403');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
