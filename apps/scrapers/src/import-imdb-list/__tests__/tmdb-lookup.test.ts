import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  fetchMovieByImdbId,
  fetchMovieDetails,
  fetchTvDetails,
  searchMovieByTitle,
} from '../tmdb-lookup';

type Route = {status: number; body?: unknown};

function stubTmdb(routes: Record<string, Route>) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = new URL(input);
      const key = `${url.pathname}?language=${url.searchParams.get('language') ?? ''}`;
      calls.push(url.pathname);
      const route =
        routes[key] ?? routes[url.pathname] ?? ({status: 404} as Route);
      return {
        ok: route.status >= 200 && route.status < 300,
        status: route.status,
        statusText: String(route.status),
        headers: new Headers(),
        async json() {
          return route.body;
        },
        async text() {
          return JSON.stringify(route.body ?? {});
        },
      };
    }),
  );
  return calls;
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fetchMovieDetails', () => {
  it('英語の詳細に日本語の題と概要を重ねる', async () => {
    stubTmdb({
      '/3/movie/278?language=en-US': {
        status: 200,
        body: {
          id: 278,
          title: 'The Shawshank Redemption',
          original_title: 'The Shawshank Redemption',
          overview: 'Two imprisoned men',
        },
      },
      '/3/movie/278?language=ja': {
        status: 200,
        body: {title: 'ショーシャンクの空に', overview: '刑務所で'},
      },
    });

    const details = await fetchMovieDetails('key', 278);

    expect(details).toEqual({
      id: 278,
      title: 'The Shawshank Redemption',
      original_title: 'The Shawshank Redemption',
      overview: 'Two imprisoned men',
      media_type: 'movie',
      localizedTitle: 'ショーシャンクの空に',
      localizedOverview: '刑務所で',
    });
  });

  it('日本語の取得に失敗しても英語の詳細を返す', async () => {
    stubTmdb({
      '/3/movie/278?language=en-US': {
        status: 200,
        body: {id: 278, title: 'Film', original_title: 'Film'},
      },
      '/3/movie/278?language=ja': {status: 500},
    });

    const details = await fetchMovieDetails('key', 278);

    expect(details).toEqual({
      id: 278,
      title: 'Film',
      original_title: 'Film',
      media_type: 'movie',
    });
  });

  it('404 なら undefined を返す', async () => {
    stubTmdb({});

    expect(await fetchMovieDetails('key', 1)).toBeUndefined();
  });

  it('404 以外の失敗は例外にする', async () => {
    stubTmdb({'/3/movie/1?language=en-US': {status: 500}});

    await expect(fetchMovieDetails('key', 1)).rejects.toThrow(
      'TMDb movie details error',
    );
  });
});

describe('fetchTvDetails', () => {
  it('TV の応答を映画と同じ形に寄せる', async () => {
    stubTmdb({
      '/3/tv/1396?language=en-US': {
        status: 200,
        body: {
          id: 1396,
          name: 'Breaking Bad',
          original_name: 'Breaking Bad',
          overview: 'A chemistry teacher',
          poster_path: '/bb.jpg',
          first_air_date: '2008-01-20',
          original_language: 'en',
        },
      },
      '/3/tv/1396?language=ja': {
        status: 200,
        body: {name: 'ブレイキング・バッド', overview: '化学教師が'},
      },
    });

    const details = await fetchTvDetails('key', 1396);

    expect(details).toEqual({
      id: 1396,
      title: 'Breaking Bad',
      original_title: 'Breaking Bad',
      original_language: 'en',
      release_date: '2008-01-20',
      poster_path: '/bb.jpg',
      overview: 'A chemistry teacher',
      media_type: 'tv',
      localizedTitle: 'ブレイキング・バッド',
      localizedOverview: '化学教師が',
    });
  });
});

describe('fetchMovieByImdbId', () => {
  it('find が映画を返せば映画の詳細を返す', async () => {
    stubTmdb({
      '/3/find/tt0111161': {
        status: 200,
        body: {movie_results: [{id: 278}], tv_results: []},
      },
      '/3/movie/278?language=en-US': {
        status: 200,
        body: {id: 278, title: 'Film', original_title: 'Film'},
      },
    });

    const details = await fetchMovieByImdbId('key', 'tt0111161');

    expect(details).toMatchObject({id: 278, media_type: 'movie'});
  });

  it('find が TV を返せば IMDb ID を付けた TV の詳細を返す', async () => {
    stubTmdb({
      '/3/find/tt0903747': {
        status: 200,
        body: {movie_results: [], tv_results: [{id: 1396}]},
      },
      '/3/tv/1396?language=en-US': {
        status: 200,
        body: {id: 1396, name: 'Breaking Bad'},
      },
    });

    const details = await fetchMovieByImdbId('key', 'tt0903747');

    expect(details).toMatchObject({
      id: 1396,
      media_type: 'tv',
      imdb_id: 'tt0903747',
    });
  });

  it('find に無ければ undefined を返す', async () => {
    stubTmdb({
      '/3/find/tt0000000': {
        status: 200,
        body: {movie_results: [], tv_results: []},
      },
    });

    expect(await fetchMovieByImdbId('key', 'tt0000000')).toBeUndefined();
  });
});

describe('searchMovieByTitle', () => {
  it('原題と年で映画検索し最初に詳細が取れた作品を返す', async () => {
    const calls = stubTmdb({
      '/3/search/movie': {
        status: 200,
        body: {results: [{id: 1}, {id: 2}]},
      },
      '/3/movie/2?language=en-US': {
        status: 200,
        body: {id: 2, title: 'Second', original_title: 'Second'},
      },
    });

    const details = await searchMovieByTitle('key', {
      Const: 'tt0000002',
      Title: '邦題',
      'Original Title': 'Second',
      Year: '2001',
    });

    expect(details).toMatchObject({id: 2, title: 'Second'});
    expect(calls).toEqual([
      '/3/search/movie',
      '/3/movie/1',
      '/3/movie/2',
      '/3/movie/2',
    ]);
  });

  it('映画検索に無ければ multi 検索で TV も拾う', async () => {
    stubTmdb({
      '/3/search/movie': {status: 200, body: {results: []}},
      '/3/search/multi': {
        status: 200,
        body: {results: [{id: 7, media_type: 'tv'}]},
      },
      '/3/tv/7?language=en-US': {
        status: 200,
        body: {id: 7, name: 'Series'},
      },
    });

    const details = await searchMovieByTitle('key', {
      Const: 'tt0000007',
      Title: 'Series',
    });

    expect(details).toMatchObject({id: 7, media_type: 'tv'});
  });

  it('題名が無ければ検索しない', async () => {
    const calls = stubTmdb({});

    expect(await searchMovieByTitle('key', {Const: 'tt1'})).toBeUndefined();
    expect(calls).toEqual([]);
  });
});
