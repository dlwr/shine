import {afterEach, describe, expect, it, vi} from 'vitest';
import {createEnvironmentContext} from './api';
import {
  fetchRelatedMovies,
  isLoaderError,
  isLoaderSuccess,
  type MovieDetailData,
} from './movie-detail';

const context = createEnvironmentContext({
  PUBLIC_API_URL: 'https://api.example',
});

const movieDetail = {
  uid: 'movie-1',
  title: 'パラサイト',
  nominations: [],
  articleLinks: [],
} as unknown as MovieDetailData;

describe('isLoaderError', () => {
  it('error を持つデータをエラーと判定する', () => {
    expect(isLoaderError({error: 'x', locale: 'ja'})).toBe(true);
  });

  it('movieDetail を持つデータはエラーではない', () => {
    expect(isLoaderError({movieDetail, locale: 'ja'})).toBe(false);
  });
});

describe('isLoaderSuccess', () => {
  it('movieDetail を持つデータを成功と判定する', () => {
    expect(isLoaderSuccess({movieDetail, locale: 'ja'})).toBe(true);
  });

  it('error を持つデータは成功ではない', () => {
    expect(isLoaderSuccess({error: 'x', locale: 'ja'})).toBe(false);
  });
});

describe('fetchRelatedMovies', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('関連映画 API を locale と件数付きで呼ぶ', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({movies: []}));
    vi.stubGlobal('fetch', fetchMock);

    await fetchRelatedMovies(context, 'movie-1', 'ja');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example/movies/movie-1/related?locale=ja&limit=6',
      expect.anything(),
    );
  });

  it('API が返した映画の一覧を返す', async () => {
    const movies = [{uid: 'r1', title: '関連映画A', year: 2020}];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({movies})));

    await expect(fetchRelatedMovies(context, 'movie-1', 'ja')).resolves.toEqual(
      movies,
    );
  });

  it('API がエラーを返したら空配列', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(undefined, {status: 500})),
    );

    await expect(fetchRelatedMovies(context, 'movie-1', 'ja')).resolves.toEqual(
      [],
    );
  });

  it('通信に失敗したら空配列', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));

    await expect(fetchRelatedMovies(context, 'movie-1', 'ja')).resolves.toEqual(
      [],
    );
  });
});
