import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it, vi} from 'vitest';
import {checkDiscas, containsYear, parseDiscasTitles} from '../sources/discas';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const readFixture = (name: string) =>
  fs.readFileSync(path.join(currentDirectory, 'fixtures', name));
const fixtureBytes = readFixture('discas-search.html');
const fixtureHtml = new TextDecoder('shift_jis').decode(fixtureBytes);
const volumeSearchBytes = readFixture('discas-search-volumes.html');
const detailBytes = readFixture('discas-detail.html');
const compilationSearchBytes = readFixture('discas-search-compilations.html');
const compilationDetailBytes = readFixture('discas-detail-compilation.html');

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

describe('containsYear', () => {
  it('finds the production year of a detail page', () => {
    const detailHtml = new TextDecoder('shift_jis').decode(detailBytes);
    expect(containsYear(detailHtml, 1986)).toBe(true);
  });

  it('finds a full-width year written in the story text', () => {
    const detailHtml = new TextDecoder('shift_jis').decode(
      compilationDetailBytes,
    );
    expect(containsYear(detailHtml, 1990)).toBe(true);
  });

  it('returns false when the page never mentions the year', () => {
    const detailHtml = new TextDecoder('shift_jis').decode(detailBytes);
    expect(containsYear(detailHtml, 1975)).toBe(false);
  });

  it('ignores a year mentioned only in a review', () => {
    const detailHtml = new TextDecoder('shift_jis').decode(
      compilationDetailBytes,
    );
    expect(containsYear(detailHtml, 1975)).toBe(false);
  });

  it('does not treat a bare number as a year', () => {
    expect(
      containsYear(
        '<html><body><p class="p-text-content">1986</p></body></html>',
        1986,
      ),
    ).toBe(false);
  });
});

function createSessionFetch(searchBytes: Buffer, detailBytes?: Buffer) {
  // 実サイトの挙動を再現: top.doでJSESSIONID発行 →
  // 検索はxdsyncへ302(追加Cookie発行) → 両Cookie持参で再度検索すると200
  return vi.fn(async (url: string, init?: RequestInit) => {
    // eslint-disable-next-line unicorn/no-declarations-before-early-exit -- 後続の分岐でも使うので前に置く
    const cookie = new Headers(init?.headers).get('cookie') ?? '';

    if (url.includes('goodsDetail.do')) {
      return detailBytes
        ? new Response(new Uint8Array(detailBytes))
        : new Response(undefined, {status: 404});
    }

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

  it('returns ok when a split release volume matches and the production year agrees', async () => {
    const fetchSpy = createSessionFetch(volumeSearchBytes, detailBytes);

    const result = await checkDiscas(['愛と宿命の泉'], fetchSpy, {year: 1986});

    expect(result.status).toBe('ok');
    expect(result.detail).toContain('愛と宿命の泉　１　フロレット家のジャン');
  });

  it('returns ng when a split release volume matches but the production year differs', async () => {
    const fetchSpy = createSessionFetch(volumeSearchBytes, detailBytes);

    const result = await checkDiscas(['愛と宿命の泉'], fetchSpy, {year: 1975});

    expect(result.status).toBe('ng');
  });

  it('returns ok for a volume match when the movie year is unknown', async () => {
    const fetchSpy = createSessionFetch(volumeSearchBytes, detailBytes);

    const result = await checkDiscas(['愛と宿命の泉'], fetchSpy);

    expect(result.status).toBe('ok');
  });

  it('returns ng when the volume detail page cannot be fetched', async () => {
    const fetchSpy = createSessionFetch(volumeSearchBytes);

    const result = await checkDiscas(['愛と宿命の泉'], fetchSpy, {year: 1986});

    expect(result.status).toBe('ng');
  });

  it('returns ok when a double feature disc lists the title and its detail page mentions the movie year', async () => {
    const fetchSpy = createSessionFetch(
      compilationSearchBytes,
      compilationDetailBytes,
    );

    const result = await checkDiscas(['マッチ工場の少女'], fetchSpy, {
      year: 1990,
    });

    expect(result.status).toBe('ok');
    expect(result.detail).toContain('マッチ工場の少女');
  });

  it('returns ng when a double feature disc lists the title but its detail page never mentions the movie year', async () => {
    const fetchSpy = createSessionFetch(
      compilationSearchBytes,
      compilationDetailBytes,
    );

    const result = await checkDiscas(['マッチ工場の少女'], fetchSpy, {
      year: 1975,
    });

    expect(result.status).toBe('ng');
  });

  it('returns ok for a double feature disc when the movie year is unknown', async () => {
    const fetchSpy = createSessionFetch(
      compilationSearchBytes,
      compilationDetailBytes,
    );

    const result = await checkDiscas(['マッチ工場の少女'], fetchSpy);

    expect(result.status).toBe('ok');
  });

  it('does not fetch detail pages when an exact title matches', async () => {
    const fetchSpy = createSessionFetch(fixtureBytes, detailBytes);

    await checkDiscas(['ゴッドファーザー PART I'], fetchSpy);

    expect(
      fetchSpy.mock.calls.some(([url]) => url.includes('goodsDetail.do')),
    ).toBe(false);
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
