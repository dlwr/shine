import {describe, expect, it} from 'vitest';
import {profileImageUrl} from './profile-image';

describe('profileImageUrl', () => {
  it('TMDbのプロフィール画像URLを組み立てる', () => {
    expect(profileImageUrl('/abc.jpg', 'w185')).toBe(
      'https://image.tmdb.org/t/p/w185/abc.jpg',
    );
  });

  it('サイズを指定できる', () => {
    expect(profileImageUrl('/abc.jpg', 'w342')).toBe(
      'https://image.tmdb.org/t/p/w342/abc.jpg',
    );
  });

  it('パスが無ければundefinedを返す', () => {
    expect(profileImageUrl(undefined, 'w185')).toBeUndefined();
  });

  it('すでにURLならそのまま返す', () => {
    expect(profileImageUrl('https://example.com/abc.jpg', 'w185')).toBe(
      'https://example.com/abc.jpg',
    );
  });

  it('高さ指定のサイズも使える', () => {
    expect(profileImageUrl('/abc.jpg', 'h632')).toBe(
      'https://image.tmdb.org/t/p/h632/abc.jpg',
    );
  });
});
