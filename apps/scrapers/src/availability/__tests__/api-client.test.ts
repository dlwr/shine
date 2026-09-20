import {describe, expect, it, vi} from 'vitest';
import {createApiClient} from '../api-client';

describe('createApiClient', () => {
  const previewResponse = {
    nextDaily: {date: '2026-07-16', movie: {uid: 'movie-1', title: 'A'}},
    nextWeekly: {date: '2026-07-17', movie: {uid: 'movie-2', title: 'B'}},
    nextMonthly: {date: '2026-08-01', movie: {uid: 'movie-3', title: 'C'}},
  };

  function createFetchStub() {
    return vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/auth/login')) {
        return Response.json({token: 'jwt-token'});
      }

      const headers = new Headers(init?.headers);
      if (headers.get('authorization') !== 'Bearer jwt-token') {
        return Response.json({error: 'unauthorized'}, {status: 401});
      }

      if (url.includes('/reselect')) {
        return Response.json({type: 'daily', movie: {uid: 'movie-99'}});
      }

      if (url.includes('/admin/preview-selections')) {
        return Response.json(previewResponse);
      }

      if (url.includes('/imdb-id') && init?.method === 'PUT') {
        return Response.json({success: true});
      }

      return Response.json({error: 'not found'}, {status: 404});
    });
  }

  it('fetches next-period selections with dates', async () => {
    const fetchStub = createFetchStub();
    const client = createApiClient({
      apiUrl: 'https://api.example.com',
      adminPassword: 'secret',
      fetchImpl: fetchStub,
    });

    const selections = await client.getNextSelections();

    expect(selections.daily).toEqual({uid: 'movie-1', date: '2026-07-16'});
    expect(selections.weekly).toEqual({uid: 'movie-2', date: '2026-07-17'});
    expect(selections.monthly).toEqual({uid: 'movie-3', date: '2026-08-01'});
  });

  it('logs in once and reselects the target date with exclusions', async () => {
    const fetchStub = createFetchStub();
    const client = createApiClient({
      apiUrl: 'https://api.example.com',
      adminPassword: 'secret',
      fetchImpl: fetchStub,
    });

    const newUid = await client.reselect('daily', ['movie-1'], '2026-07-16');
    await client.reselect('daily', ['movie-1', 'movie-99'], '2026-07-16');

    expect(newUid).toBe('movie-99');
    const loginCalls = fetchStub.mock.calls.filter(([url]) =>
      (url as string).endsWith('/auth/login'),
    );
    expect(loginCalls).toHaveLength(1);
    const reselectCall = fetchStub.mock.calls.find(([url]) =>
      (url as string).includes('/reselect'),
    );
    const body = JSON.parse((reselectCall?.[1] as RequestInit).body as string);
    expect(body.excludeMovieUids).toEqual(['movie-1']);
    expect(body.type).toBe('daily');
    expect(body.date).toBe('2026-07-16');
  });

  it('refreshTmdbData PUTs the imdb-id endpoint with refreshData', async () => {
    const fetchStub = createFetchStub();
    const client = createApiClient({
      apiUrl: 'https://api.example.com',
      adminPassword: 'secret',
      fetchImpl: fetchStub,
    });

    await client.refreshTmdbData('movie-b', 'tt0245712');

    const call = fetchStub.mock.calls.find(([url]) =>
      (url as string).includes('/imdb-id'),
    );
    expect(call?.[0]).toBe(
      'https://api.example.com/admin/movies/movie-b/imdb-id',
    );
    const body = JSON.parse((call?.[1] as RequestInit).body as string);
    expect(body).toEqual({imdbId: 'tt0245712', refreshData: true});
  });

  it('refreshTmdbData throws on an HTTP error', async () => {
    const fetchStub = vi.fn(async (url: string) => {
      if (url.endsWith('/auth/login')) {
        return Response.json({token: 'jwt-token'});
      }

      return Response.json({error: 'boom'}, {status: 500});
    });
    const client = createApiClient({
      apiUrl: 'https://api.example.com',
      adminPassword: 'secret',
      fetchImpl: fetchStub,
    });

    await expect(
      client.refreshTmdbData('movie-b', 'tt0245712'),
    ).rejects.toThrow('500');
  });

  it('throws when login fails', async () => {
    const fetchStub = vi.fn(async () =>
      Response.json({error: 'bad password'}, {status: 401}),
    );
    const client = createApiClient({
      apiUrl: 'https://api.example.com',
      adminPassword: 'wrong',
      fetchImpl: fetchStub,
    });

    await expect(client.reselect('daily', [], '2026-07-16')).rejects.toThrow(
      '401',
    );
  });

  it('throws when a next selection has no movie', async () => {
    const fetchStub = vi.fn(async (url: string) => {
      if (url.endsWith('/auth/login')) {
        return Response.json({token: 'jwt-token'});
      }

      return Response.json({
        ...previewResponse,
        nextDaily: {date: '2026-07-16'},
      });
    });
    const client = createApiClient({
      apiUrl: 'https://api.example.com',
      adminPassword: 'secret',
      fetchImpl: fetchStub,
    });

    await expect(client.getNextSelections()).rejects.toThrow('daily');
  });
});
