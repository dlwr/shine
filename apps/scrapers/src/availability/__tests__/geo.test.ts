import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it, vi} from 'vitest';
import {checkGeo, parseGeoTitles} from '../sources/geo';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const fixtureBytes = fs.readFileSync(
  path.join(currentDirectory, 'fixtures/geo-search.html'),
);
const fixtureHtml = new TextDecoder('euc-jp').decode(fixtureBytes);

describe('parseGeoTitles', () => {
  it('extracts product titles from search results', () => {
    expect(parseGeoTitles(fixtureHtml)).toEqual([
      'ゴッドファーザー',
      '東京ゴッドファーザーズ',
      '【Blu-ray】ゴッドファーザー PARTI デジタル・リストア版',
    ]);
  });

  it('returns empty array when no results', () => {
    expect(parseGeoTitles('<html><body>該当なし</body></html>')).toEqual([]);
  });
});

describe('checkGeo', () => {
  const fetchFixture = vi.fn(async () => new Response(fixtureBytes));

  it('returns ok when a search result matches a target title', async () => {
    const result = await checkGeo(['ゴッドファーザー'], fetchFixture);

    expect(result.status).toBe('ok');
    expect(result.source).toBe('geo');
  });

  it('encodes the search query as EUC-JP in the request URL', async () => {
    const fetchSpy = vi.fn(async () => new Response(fixtureBytes));
    await checkGeo(['ゴッドファーザー'], fetchSpy);

    const requestedUrl = fetchSpy.mock.calls[0]?.[0] as string;
    expect(requestedUrl).toContain(
      'q-%A5%B4%A5%C3%A5%C9%A5%D5%A5%A1%A1%BC%A5%B6%A1%BC',
    );
    expect(requestedUrl).toContain('c-dvd');
  });

  it('returns ng when no result matches', async () => {
    const result = await checkGeo(['存在しない映画XYZ'], fetchFixture);

    expect(result.status).toBe('ng');
  });

  it('returns error when the fetch fails', async () => {
    const failingFetch = vi.fn(async () => {
      throw new Error('network down');
    });

    const result = await checkGeo(['ゴッドファーザー'], failingFetch);

    expect(result.status).toBe('error');
    expect(result.detail).toContain('network down');
  });

  it('returns error when the response is not ok', async () => {
    const errorFetch = vi.fn(async () => new Response('error', {status: 503}));

    const result = await checkGeo(['ゴッドファーザー'], errorFetch);

    expect(result.status).toBe('error');
  });
});
