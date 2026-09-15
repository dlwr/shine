import {describe, expect, it} from 'vitest';
import {deliveredPosterUrl, parsePosterPath} from './poster-delivery';

const tmdb = 'https://image.tmdb.org/t/p/w500/AlibMyoMlu0bk0ksJfD95ox8XN9.jpg';

describe('deliveredPosterUrl', () => {
  it('有効なら自前の /posters 経路を Image Transformations に通す', () => {
    expect(deliveredPosterUrl(tmdb, true)).toBe(
      '/cdn-cgi/image/format=auto,quality=70/posters/w500/AlibMyoMlu0bk0ksJfD95ox8XN9.jpg',
    );
  });

  it('無効なら TMDb の URL のまま', () => {
    expect(deliveredPosterUrl(tmdb, false)).toBe(tmdb);
  });

  it('TMDb 以外の URL は触らない', () => {
    expect(deliveredPosterUrl('https://example.com/p.jpg', true)).toBe(
      'https://example.com/p.jpg',
    );
  });

  it('URL が無ければ undefined', () => {
    expect(deliveredPosterUrl(undefined, true)).toBeUndefined();
  });
});

describe('parsePosterPath', () => {
  it('サイズとファイル名を取り出す', () => {
    expect(
      parsePosterPath('/posters/w500/AlibMyoMlu0bk0ksJfD95ox8XN9.jpg'),
    ).toEqual({size: 'w500', file: 'AlibMyoMlu0bk0ksJfD95ox8XN9.jpg'});
  });

  it('original も通す', () => {
    expect(parsePosterPath('/posters/original/a-b_c.png')).toEqual({
      size: 'original',
      file: 'a-b_c.png',
    });
  });

  it('TMDb のパスにならない形は弾く', () => {
    expect(parsePosterPath('/posters/w500/../x.jpg')).toBeUndefined();
    expect(parsePosterPath('/posters/w500/x.svg')).toBeUndefined();
    expect(parsePosterPath('/posters/huge/x.jpg')).toBeUndefined();
    expect(parsePosterPath('/movies/abc')).toBeUndefined();
  });
});
