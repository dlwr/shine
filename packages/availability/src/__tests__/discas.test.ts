import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it, vi} from 'vitest';
import {checkDiscas, parseDiscasTitles} from '../sources/discas';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const fixtureBytes = fs.readFileSync(
  path.join(currentDirectory, 'fixtures/discas-search.html'),
);
const fixtureHtml = new TextDecoder('shift_jis').decode(fixtureBytes);

describe('parseDiscasTitles', () => {
  it('extracts titles from goodsDetail links, decoding character references', () => {
    expect(parseDiscasTitles(fixtureHtml)).toEqual([
      'ゴッドファーザー　ＰＡＲＴ　Ｉ',
      'ゴッドファーザー　ＰＡＲＴ　ＩＩ',
      '東京ゴッドファーザーズ',
    ]);
  });

  it('returns empty array when no results', () => {
    expect(parseDiscasTitles('<html><body>0件</body></html>')).toEqual([]);
  });
});

function createSessionFetch(searchBytes: Buffer) {
  // 実サイトの挙動を再現: top.doでJSESSIONID発行 →
  // 検索はxdsyncへ302(追加Cookie発行) → 両Cookie持参で再度検索すると200
  return vi.fn(async (url: string, init?: RequestInit) => {
    const cookie = new Headers(init?.headers).get('cookie') ?? '';

    if (url.includes('top.do') && !cookie.includes('JSESSIONID=abc123')) {
      return new Response('', {
        status: 302,
        headers: {
          'set-cookie': 'JSESSIONID=abc123; Path=/',
          location: `https://movie-tsutaya.tsite.jp/netdvd/xdsync?next=${encodeURIComponent(url)}`,
        },
      });
    }

    if (!cookie.includes('JSESSIONID=abc123')) {
      return new Response('', {status: 500});
    }

    if (url.includes('searchDvdBd.do') && !cookie.includes('xdid=tracked')) {
      return new Response('', {
        status: 302,
        headers: {
          'set-cookie': 'xdid=tracked; Path=/',
          location: `https://movie-tsutaya.tsite.jp/netdvd/xdsync?next=${encodeURIComponent(url)}`,
        },
      });
    }

    if (url.includes('xdsync')) {
      const next = new URL(url).searchParams.get('next') ?? '';
      return new Response('', {
        status: 302,
        headers: {location: next},
      });
    }

    if (url.includes('top.do')) {
      return new Response('');
    }

    return new Response(new Uint8Array(searchBytes));
  });
}

describe('checkDiscas', () => {
  it('establishes a session then returns ok on a title match', async () => {
    const fetchSpy = createSessionFetch(fixtureBytes);

    const result = await checkDiscas(['ゴッドファーザー PART I'], fetchSpy);

    expect(result.status).toBe('ok');
    expect(result.source).toBe('discas');
    const searchUrl = fetchSpy.mock.calls
      .map(([url]) => url)
      .find(url => url.includes('searchDvdBd.do'));
    expect(searchUrl).toContain(
      'k=%83%53%83%62%83%68%83%74%83%40%81%5B%83%55%81%5B',
    );
  });

  it('returns ng when no result matches', async () => {
    const fetchSpy = createSessionFetch(fixtureBytes);

    const result = await checkDiscas(['存在しない映画XYZ'], fetchSpy);

    expect(result.status).toBe('ng');
  });

  it('returns ng when the search responds 404 (DISCASの0件ヒット時の挙動)', async () => {
    const fetchSpy = createSessionFetch(fixtureBytes);
    const notFoundFetch = vi.fn(async (url: string, init?: RequestInit) => {
      const cookie = new Headers(init?.headers).get('cookie') ?? '';
      if (
        url.includes('searchDvdBd.do') &&
        cookie.includes('JSESSIONID=abc123') &&
        cookie.includes('xdid=tracked')
      ) {
        return new Response(undefined, {status: 404});
      }

      return fetchSpy(url, init);
    });

    const result = await checkDiscas(
      ['zzzz存在しないタイトルzzzz'],
      notFoundFetch,
    );

    expect(result.status).toBe('ng');
    expect(result.detail).toContain('404');
  });

  it('returns error when the search request fails', async () => {
    const failingFetch = vi.fn(async () => {
      throw new Error('connection reset');
    });

    const result = await checkDiscas(['ゴッドファーザー'], failingFetch);

    expect(result.status).toBe('error');
    expect(result.detail).toContain('connection reset');
  });
});
