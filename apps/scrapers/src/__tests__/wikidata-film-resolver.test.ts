import {afterEach, describe, expect, it, vi} from 'vitest';
import {resolveFilmsByWikipediaPage} from '../common/wikidata-film-resolver';

function jsonResponse(body: unknown): Response {
  return Response.json(body, {
    status: 200,
    headers: {'content-type': 'application/json'},
  });
}

const WIKIPEDIA_BODY = {
  query: {
    pages: {
      '1': {
        title: '7th Heaven (1927 film)',
        pageprops: {wikibase_item: 'Q1'},
      },
    },
  },
};

const WIKIDATA_BODY = {
  entities: {
    Q1: {
      claims: {P345: [{mainsnak: {datavalue: {value: 'tt0018379'}}}]},
      labels: {en: {value: '7th Heaven'}},
    },
  },
};

function stubWikipediaAndWikidata(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (url: string) =>
    jsonResponse(
      url.includes('wikipedia.org') ? WIKIPEDIA_BODY : WIKIDATA_BODY,
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('resolveFilmsByWikipediaPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('指定した言語版のWikipediaに問い合わせる', async () => {
    const fetchMock = stubWikipediaAndWikidata();

    const resolved = await resolveFilmsByWikipediaPage(
      ['7th Heaven (1927 film)'],
      {language: 'en'},
    );

    expect(resolved.get('7th Heaven (1927 film)')).toMatchObject({
      imdbId: 'tt0018379',
      englishTitle: '7th Heaven',
    });
    expect(fetchMock.mock.calls[0][0]).toContain(
      'https://en.wikipedia.org/w/api.php',
    );
  });

  it('既定では日本語版に問い合わせる', async () => {
    const fetchMock = stubWikipediaAndWikidata();

    await resolveFilmsByWikipediaPage(['7th Heaven (1927 film)']);

    expect(fetchMock.mock.calls[0][0]).toContain(
      'https://ja.wikipedia.org/w/api.php',
    );
  });
});
