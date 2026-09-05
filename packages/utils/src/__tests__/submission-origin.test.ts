import {describe, expect, it} from 'vitest';
import {
  classifySubmission,
  DEFAULT_OWNER_URL_PREFIXES,
  parseOriginRules,
} from '../submission-origin';

const defaultRules = {
  ownerUrlPrefixes: DEFAULT_OWNER_URL_PREFIXES,
  ownerIps: [],
};

describe('classifySubmission', () => {
  it('本人の Scrapbox の URL は owner になる', () => {
    expect(
      classifySubmission(
        {
          url: 'https://scrapbox.io/yuta25/%E3%82%B4%E3%83%83',
          submitterIp: undefined,
        },
        defaultRules,
      ),
    ).toBe('owner');
  });

  it('ループバックからの投稿は test になる', () => {
    expect(
      classifySubmission(
        {url: 'https://example.com/review', submitterIp: '127.0.0.1'},
        defaultRules,
      ),
    ).toBe('test');
  });

  it('IPv6 のループバックも test になる', () => {
    expect(
      classifySubmission(
        {url: 'https://example.com/review', submitterIp: '::1'},
        defaultRules,
      ),
    ).toBe('test');
  });

  it('設定した本人の IP からの投稿は owner になる', () => {
    expect(
      classifySubmission(
        {url: 'https://example.com/review', submitterIp: '2a06:98c0:3600::103'},
        {ownerUrlPrefixes: [], ownerIps: ['2a06:98c0:3600::103']},
      ),
    ).toBe('owner');
  });

  it('本人でもテストでもない投稿は other になる', () => {
    expect(
      classifySubmission(
        {url: 'https://example.com/review', submitterIp: '203.0.113.9'},
        defaultRules,
      ),
    ).toBe('other');
  });

  it('URL が空の投稿は URL では本人と判定しない', () => {
    expect(
      classifySubmission({url: '', submitterIp: '203.0.113.9'}, defaultRules),
    ).toBe('other');
  });
});

describe('parseOriginRules', () => {
  it('環境変数が無ければ既定の Scrapbox プレフィックスを使う', () => {
    expect(parseOriginRules({})).toEqual({
      ownerUrlPrefixes: DEFAULT_OWNER_URL_PREFIXES,
      ownerIps: [],
    });
  });

  it('本人の IP をカンマ区切りで受け取る', () => {
    expect(
      parseOriginRules({NORTH_STAR_OWNER_IPS: '203.0.113.9, 2a06:98c0::1'}),
    ).toEqual({
      ownerUrlPrefixes: DEFAULT_OWNER_URL_PREFIXES,
      ownerIps: ['203.0.113.9', '2a06:98c0::1'],
    });
  });

  it('本人の URL プレフィックスを環境変数で差し替えられる', () => {
    expect(
      parseOriginRules({
        NORTH_STAR_OWNER_URL_PREFIXES: 'https://example.com/me/',
      }).ownerUrlPrefixes,
    ).toEqual(['https://example.com/me/']);
  });
});
