import {describe, expect, it} from 'vitest';
import {buildOAuth1Header, percentEncode} from './x';

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
