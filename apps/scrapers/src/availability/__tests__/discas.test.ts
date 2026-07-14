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
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('top.do')) {
      return new Response('', {
        status: 302,
        headers: {
          'set-cookie': 'JSESSIONID=abc123; Path=/',
          location: 'https://movie-tsutaya.tsite.jp/netdvd/xdsync',
        },
      });
    }

    const cookie = new Headers(init?.headers).get('cookie') ?? '';
    if (!cookie.includes('JSESSIONID=abc123')) {
      return new Response('', {status: 500});
    }

    return new Response(searchBytes);
  });
}

describe('checkDiscas', () => {
  it('establishes a session then returns ok on a title match', async () => {
    const fetchSpy = createSessionFetch(fixtureBytes);

    const result = await checkDiscas(['ゴッドファーザー PART I'], fetchSpy);

    expect(result.status).toBe('ok');
    expect(result.source).toBe('discas');
    const searchCall = fetchSpy.mock.calls.find(([url]) =>
      (url as string).includes('searchDvdBd.do'),
    );
    expect(searchCall?.[0]).toContain(
      'k=%83%53%83%62%83%68%83%74%83%40%81%5B%83%55%81%5B',
    );
  });

  it('returns ng when no result matches', async () => {
    const fetchSpy = createSessionFetch(fixtureBytes);

    const result = await checkDiscas(['存在しない映画XYZ'], fetchSpy);

    expect(result.status).toBe('ng');
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
