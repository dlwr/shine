import {describe, expect, it, vi} from 'vitest';
import {fetchJapaneseAlternativeTitles} from '../alternative-titles';

const alternativeTitlesResponse = {
  id: 18_747,
  titles: [
    {iso_3166_1: 'US', title: 'Election'},
    {iso_3166_1: 'DE', title: 'Election 1'},
    {iso_3166_1: 'JP', title: 'エレクション'},
    {iso_3166_1: 'JP', title: 'エレクション 黒社会'},
    {iso_3166_1: 'JP', title: 'エレクション：2005'},
  ],
};

describe('fetchJapaneseAlternativeTitles', () => {
  it('returns only titles registered for JP', async () => {
    const fetchSpy = vi.fn<
      (url: string, init?: RequestInit) => Promise<Response>
    >(async () => Response.json(alternativeTitlesResponse));

    const titles = await fetchJapaneseAlternativeTitles(
      18_747,
      'api-key',
      fetchSpy,
    );

    expect(titles).toEqual([
      'エレクション',
      'エレクション 黒社会',
      'エレクション：2005',
    ]);
  });

  it('requests the alternative_titles endpoint of the given movie', async () => {
    const fetchSpy = vi.fn<
      (url: string, init?: RequestInit) => Promise<Response>
    >(async () => Response.json(alternativeTitlesResponse));

    await fetchJapaneseAlternativeTitles(18_747, 'api-key', fetchSpy);

    expect(fetchSpy.mock.calls[0]?.[0]).toContain(
      '/movie/18747/alternative_titles',
    );
  });

  it('drops empty and duplicated titles', async () => {
    const fetchSpy = vi.fn(async () =>
      Response.json({
        titles: [
          {iso_3166_1: 'JP', title: 'エレクション'},
          {iso_3166_1: 'JP', title: 'エレクション'},
          {iso_3166_1: 'JP', title: '  '},
          {iso_3166_1: 'JP'},
        ],
      }),
    );

    const titles = await fetchJapaneseAlternativeTitles(
      18_747,
      'api-key',
      fetchSpy,
    );

    expect(titles).toEqual(['エレクション']);
  });

  it('returns an empty list on HTTP failure', async () => {
    const fetchSpy = vi.fn(
      async () => new Response('unauthorized', {status: 401}),
    );

    await expect(
      fetchJapaneseAlternativeTitles(18_747, 'api-key', fetchSpy),
    ).resolves.toEqual([]);
  });

  it('returns an empty list when fetch throws', async () => {
    const failingFetch = vi.fn(async () => {
      throw new Error('dns failure');
    });

    await expect(
      fetchJapaneseAlternativeTitles(18_747, 'api-key', failingFetch),
    ).resolves.toEqual([]);
  });

  it('returns an empty list without an API key', async () => {
    const fetchSpy = vi.fn(async () =>
      Response.json(alternativeTitlesResponse),
    );

    await expect(
      fetchJapaneseAlternativeTitles(18_747, '', fetchSpy),
    ).resolves.toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
