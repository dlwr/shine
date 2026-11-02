import {describe, expect, it} from 'vitest';
import {awardRegulars} from './award-regulars';
import type {PersonAwardDetailData} from './api-types';

function nominee(uid: string, isWinner = false) {
  return {uid, name: uid, originalName: uid, isWinner, movies: []};
}

function award(
  years: Array<Array<ReturnType<typeof nominee>>>,
): PersonAwardDetailData {
  return {
    slug: 'japan-academy-lead-actor',
    name: '最優秀主演男優賞',
    organization: '日本アカデミー賞',
    description: '',
    grouping: 'person',
    years: years.map((nominees, index) => ({
      year: 2000 - index,
      ceremonyNumber: undefined,
      nominees,
    })),
  };
}

describe('awardRegulars', () => {
  it('受賞の回数、ノミネートの回数の順に並べる', () => {
    const result = awardRegulars(
      award([
        [nominee('a', true), nominee('b'), nominee('c')],
        [nominee('b', true), nominee('a'), nominee('c')],
        [nominee('a', true), nominee('c'), nominee('d')],
        [nominee('c'), nominee('d', true)],
      ]),
    );

    expect(
      result.map(({uid, wins, nominations}) => [uid, wins, nominations]),
    ).toEqual([
      ['a', 2, 3],
      ['b', 1, 2],
      ['d', 1, 2],
      ['c', 0, 4],
    ]);
  });

  it('ノミネート 1 回の人は入れない', () => {
    const result = awardRegulars(
      award([
        [nominee('a', true), nominee('b'), nominee('c'), nominee('x')],
        [nominee('a'), nominee('b'), nominee('c', true)],
      ]),
    );

    expect(result.map(regular => regular.uid)).toEqual(['a', 'c', 'b']);
  });

  it('2 回以上の人が 3 人に満たなければ出さない', () => {
    const result = awardRegulars(
      award([
        [nominee('a', true), nominee('b')],
        [nominee('a'), nominee('b', true)],
      ]),
    );

    expect(result).toEqual([]);
  });

  it('上限の人数で切る', () => {
    const result = awardRegulars(
      award([
        [nominee('a'), nominee('b'), nominee('c')],
        [nominee('a'), nominee('b'), nominee('c')],
      ]),
      2,
    );

    expect(result).toHaveLength(2);
  });
});
