import {afterEach, describe, expect, it, vi} from 'vitest';
import {fetchWikitext} from '../common/wikitext';

function stubFetch(body: unknown): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(
    async () =>
      Response.json(body, {
        status: 200,
        headers: {'content-type': 'application/json'},
      }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('fetchWikitext', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('指定した言語版の記事のwikitextを返す', async () => {
    const fetchMock = stubFetch({parse: {wikitext: {'*': '==Winners=='}}});

    const wikitext = await fetchWikitext('Academy Award for Best Director', {
      language: 'en',
    });

    expect(wikitext).toBe('==Winners==');
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.origin).toBe('https://en.wikipedia.org');
    expect(url.searchParams.get('page')).toBe(
      'Academy Award for Best Director',
    );
  });

  it('記事が無ければ記事名を含む例外を投げる', async () => {
    stubFetch({});

    await expect(
      fetchWikitext('No Such Article', {language: 'en'}),
    ).rejects.toThrow('No Such Article');
  });
});
