import {describe, expect, it} from 'vitest';
import {getPrimaryTitle} from './primary-title';
import type {SearchMovie} from './types';

const movie: SearchMovie = {
  uid: 'm',
  title: '七人の侍',
  year: 1954,
  originalLanguage: 'ja',
  imdbId: null,
  mediaType: 'movie',
  posterUrl: null,
  nominationCount: 0,
};

describe('getPrimaryTitle', () => {
  it('title があればそれを返す', () => {
    expect(getPrimaryTitle(movie)).toBe('七人の侍');
  });

  it('title が空なら無題', () => {
    expect(getPrimaryTitle({...movie, title: ''})).toBe('無題');
  });

  it('映画が無ければ無題', () => {
    expect(getPrimaryTitle(undefined)).toBe('無題');
  });
});
