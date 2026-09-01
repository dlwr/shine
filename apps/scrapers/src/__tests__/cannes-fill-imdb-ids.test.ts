import {describe, expect, it} from 'vitest';
import {matchByTitle} from '../cannes-fill-imdb-ids';

describe('英題による突き合わせ', () => {
  it('記号と大小文字の違いを無視して一致させる', () => {
    expect(
      matchByTitle(
        [{title: 'M*A*S*H', imdbId: 'tt0066026'}],
        [{movieUid: 'u1', title: 'MASH'}],
      ),
    ).toEqual([{movieUid: 'u1', title: 'MASH', imdbId: 'tt0066026'}]);
  });

  it('記事側に同じ英題が複数あるときは一致させない', () => {
    expect(
      matchByTitle(
        [
          {title: 'Silence', imdbId: 'tt0067755'},
          {title: 'Silence', imdbId: 'tt0171829'},
        ],
        [{movieUid: 'u1', title: 'Silence'}],
      ),
    ).toEqual([]);
  });

  it('DB側に同じ英題が複数あるときは一致させない', () => {
    expect(
      matchByTitle(
        [{title: 'Silence', imdbId: 'tt0067755'}],
        [
          {movieUid: 'u1', title: 'Silence'},
          {movieUid: 'u2', title: 'Silence'},
        ],
      ),
    ).toEqual([]);
  });

  it('DBに無い作品は一致させない', () => {
    expect(
      matchByTitle(
        [{title: 'Taxi Driver', imdbId: 'tt0075314'}],
        [{movieUid: 'u1', title: 'MASH'}],
      ),
    ).toEqual([]);
  });
});
