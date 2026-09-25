import {describe, expect, it, vi} from 'vitest';
import {buildSourceRunners} from '../source-runners';

const alternativeTitleMovie = {
  uid: 'movie-a',
  japaneseTitles: ['エレクション'],
  tmdbId: 18_747,
};

const buildAlternativeTitleFetchStub = () =>
  vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async url => {
    if (url.includes('/alternative_titles')) {
      return Response.json({
        titles: [
          {iso_3166_1: 'US', title: 'Election'},
          {iso_3166_1: 'JP', title: 'エレクション 黒社会'},
        ],
      });
    }

    return Response.json({
      data: {
        webfront_videoFreewordSearch: {
          titles: [{titleName: 'エレクション 黒社会'}],
        },
      },
    });
  });

describe('buildSourceRunners', () => {
  it('does not include geo (blocked with constant HTTP 403)', () => {
    const runners = buildSourceRunners({
      environment: {DATABASE_FILE_URL: ''},
    });
    expect(Object.keys(runners)).toEqual(['tmdb', 'unext', 'discas']);
  });

  it('returns an error result when the IMDb lookup on TMDb fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('unauthorized', {status: 401})),
    );
    const runners = buildSourceRunners({
      environment: {
        TMDB_API_KEY: 'api-key',
      },
      waitMs: 0,
    });

    const result = await runners.tmdb!({
      uid: 'movie-a',
      japaneseTitles: ['エレクション'],
      imdbId: 'tt0000001',
    });
    vi.unstubAllGlobals();

    expect(result).toMatchObject({source: 'tmdb', status: 'error'});
  });

  it('邦題の無い映画は U-NEXT を検索せず ng にする', async () => {
    const fetchImpl = vi.fn();
    const runners = buildSourceRunners({
      environment: {DATABASE_FILE_URL: ''},
      fetchImpl,
      waitMs: 0,
    });

    const result = await runners.unext!({uid: 'movie-b', japaneseTitles: []});

    expect(result).toMatchObject({source: 'unext', status: 'ng'});
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  describe('with TMDb Japanese alternative titles', () => {
    it('matches a U-NEXT title that only appears as an alternative title', async () => {
      const runners = buildSourceRunners({
        environment: {
          TMDB_API_KEY: 'api-key',
        },
        fetchImpl: buildAlternativeTitleFetchStub(),
        waitMs: 0,
      });

      const result = await runners.unext!(alternativeTitleMovie);

      expect(result.status).toBe('ok');
    });

    it('keeps the primary title as the search query', async () => {
      const fetchStub = buildAlternativeTitleFetchStub();
      const runners = buildSourceRunners({
        environment: {
          TMDB_API_KEY: 'api-key',
        },
        fetchImpl: fetchStub,
        waitMs: 0,
      });

      await runners.unext!(alternativeTitleMovie);

      const searchCall = fetchStub.mock.calls.find(call =>
        call[0].includes('cc.unext.jp'),
      );
      expect(decodeURIComponent(searchCall![0])).toContain(
        '"query":"エレクション"',
      );
    });

    it('fetches alternative titles only once per movie', async () => {
      const fetchStub = buildAlternativeTitleFetchStub();
      const runners = buildSourceRunners({
        environment: {
          TMDB_API_KEY: 'api-key',
        },
        fetchImpl: fetchStub,
        waitMs: 0,
      });

      await runners.unext!(alternativeTitleMovie);
      await runners.unext!(alternativeTitleMovie);

      const alternativeTitleCalls = fetchStub.mock.calls.filter(call =>
        call[0].includes('/alternative_titles'),
      );
      expect(alternativeTitleCalls).toHaveLength(1);
    });
  });
});
