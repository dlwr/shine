import {describe, expect, it, vi} from 'vitest';
import {checkTmdbProviders} from '../sources/tmdb';

const providersResponse = {
  id: 238,
  results: {
    JP: {
      link: 'https://www.themoviedb.org/movie/238/watch?locale=JP',
      flatrate: [{provider_name: 'U-NEXT'}],
      rent: [{provider_name: 'Amazon Video'}],
      buy: [{provider_name: 'Apple TV'}],
    },
  },
};

describe('checkTmdbProviders', () => {
  it('returns ok with provider names when JP providers exist', async () => {
    const fetchSpy = vi.fn<
      (url: string, init?: RequestInit) => Promise<Response>
    >(async () => Response.json(providersResponse));

    const result = await checkTmdbProviders(238, 'api-key', fetchSpy);

    expect(result.status).toBe('ok');
    expect(result.source).toBe('tmdb');
    expect(result.detail).toContain('U-NEXT');
    expect(fetchSpy.mock.calls[0]?.[0]).toContain('/movie/238/watch/providers');
  });

  it('returns ng when JP has no providers', async () => {
    const fetchSpy = vi.fn(async () => Response.json({id: 238, results: {}}));

    const result = await checkTmdbProviders(238, 'api-key', fetchSpy);

    expect(result.status).toBe('ng');
  });

  it('returns ng when JP entry has only a link without offerings', async () => {
    const fetchSpy = vi.fn(async () =>
      Response.json({id: 238, results: {JP: {link: 'https://x'}}}),
    );

    const result = await checkTmdbProviders(238, 'api-key', fetchSpy);

    expect(result.status).toBe('ng');
  });

  it('returns ng when the only JP provider is defunct Google Play Movies', async () => {
    const fetchSpy = vi.fn(async () =>
      Response.json({
        id: 238,
        results: {
          JP: {
            rent: [{provider_id: 3, provider_name: 'Google Play Movies'}],
            buy: [{provider_id: 3, provider_name: 'Google Play Movies'}],
          },
        },
      }),
    );

    const result = await checkTmdbProviders(238, 'api-key', fetchSpy);

    expect(result.status).toBe('ng');
  });

  it('excludes defunct Google Play Movies from detail when other providers exist', async () => {
    const fetchSpy = vi.fn(async () =>
      Response.json({
        id: 238,
        results: {
          JP: {
            rent: [
              {provider_id: 3, provider_name: 'Google Play Movies'},
              {provider_id: 10, provider_name: 'Amazon Video'},
            ],
          },
        },
      }),
    );

    const result = await checkTmdbProviders(238, 'api-key', fetchSpy);

    expect(result.status).toBe('ok');
    expect(result.detail).toContain('Amazon Video');
    expect(result.detail).not.toContain('Google Play Movies');
  });

  it('returns error on HTTP failure', async () => {
    const fetchSpy = vi.fn(
      async () => new Response('unauthorized', {status: 401}),
    );

    const result = await checkTmdbProviders(238, 'api-key', fetchSpy);

    expect(result.status).toBe('error');
  });

  it('returns error when fetch throws', async () => {
    const failingFetch = vi.fn(async () => {
      throw new Error('dns failure');
    });

    const result = await checkTmdbProviders(238, 'api-key', failingFetch);

    expect(result.status).toBe('error');
    expect(result.detail).toContain('dns failure');
  });
});
