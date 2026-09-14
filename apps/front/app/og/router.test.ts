import {describe, expect, it} from 'vitest';
import {isOgPath, OG_PATHS} from './paths';
import {ogHandlers} from './router';

describe('isOgPath', () => {
  it.each([
    '/og/movie.png',
    '/og/person.png',
    '/og/home.png',
    '/og/banner.png',
    '/og/quiz.png',
    '/og/watched.png',
    '/quiz/poster.png',
  ])('%s は OG worker に回す', pathname => {
    expect(isOgPath(pathname)).toBe(true);
  });

  it.each(['/quiz', '/og', '/og/unknown.png', '/movies/og/home.png'])(
    '%s は front で描く',
    pathname => {
      expect(isOgPath(pathname)).toBe(false);
    },
  );
});

describe('ogHandlers', () => {
  it('OG worker に回すパスそれぞれに描画の処理がある', () => {
    expect(new Set(Object.keys(ogHandlers))).toEqual(new Set(OG_PATHS));
  });
});
