import {describe, expect, it} from 'vitest';
import {posterUrlForDisplay} from './poster-size';

describe('posterUrlForDisplay', () => {
  it('原寸のTMDb URLを表示サイズに落とす', () => {
    expect(
      posterUrlForDisplay(
        'https://image.tmdb.org/t/p/original/abc.jpg',
        'w500',
      ),
    ).toBe('https://image.tmdb.org/t/p/w500/abc.jpg');
  });

  it('表示サイズより大きいものを落とす', () => {
    expect(
      posterUrlForDisplay('https://image.tmdb.org/t/p/w780/abc.jpg', 'w342'),
    ).toBe('https://image.tmdb.org/t/p/w342/abc.jpg');
  });

  it('表示サイズより小さいものは拡大しない', () => {
    expect(
      posterUrlForDisplay('https://image.tmdb.org/t/p/w185/abc.jpg', 'w500'),
    ).toBe('https://image.tmdb.org/t/p/w185/abc.jpg');
  });

  it('同じサイズはそのまま返す', () => {
    expect(
      posterUrlForDisplay('https://image.tmdb.org/t/p/w500/abc.jpg', 'w500'),
    ).toBe('https://image.tmdb.org/t/p/w500/abc.jpg');
  });

  it('TMDb以外のURLは書き換えない', () => {
    expect(
      posterUrlForDisplay('https://example.com/t/p/original/abc.jpg', 'w500'),
    ).toBe('https://example.com/t/p/original/abc.jpg');
  });

  it('undefinedはそのまま返す', () => {
    expect(posterUrlForDisplay(undefined, 'w500')).toBeUndefined();
  });

  it('サイズ表記が想定外でも壊さない', () => {
    expect(
      posterUrlForDisplay('https://image.tmdb.org/t/p/h632/abc.jpg', 'w500'),
    ).toBe('https://image.tmdb.org/t/p/h632/abc.jpg');
  });
});
