import {describe, expect, it} from 'vitest';
import {pickOrderPair} from '../quiz-order';

function entry(uid: string, releaseDate?: string) {
  return {uid, releaseDate};
}

const POOL = [
  entry('a', '1950-01-01'),
  entry('b', '1960-06-01'),
  entry('c', '1970-03-01'),
  entry('d', '1980-09-01'),
  entry('e', '1990-12-01'),
];

const FEBRUARY = Array.from(
  {length: 28},
  (_, index) => `2026-02-${String(index + 1).padStart(2, '0')}`,
);

function uidsOf(pair: Array<{uid: string}> | undefined): string[] {
  return (pair ?? []).map(movie => movie.uid).toSorted();
}

describe('pickOrderPair', () => {
  it('同じ日には同じ2本を選ぶ', () => {
    expect(pickOrderPair(POOL, '2026-10-28')).toEqual(
      pickOrderPair(POOL, '2026-10-28'),
    );
  });

  it('違う2本を選ぶ', () => {
    for (const date of FEBRUARY) {
      expect(new Set(uidsOf(pickOrderPair(POOL, date))).size, date).toBe(2);
    }
  });

  it('公開日が1年未満しか離れていない組は選ばない', () => {
    const pool = [
      entry('x', '2000-01-01'),
      entry('y', '2000-06-01'),
      entry('z', '2005-01-01'),
    ];
    for (const date of FEBRUARY) {
      expect(uidsOf(pickOrderPair(pool, date)), date).not.toEqual(['x', 'y']);
    }
  });

  it('公開日の無い映画は選ばない', () => {
    const pool = [
      entry('x'),
      entry('y', '2000-01-01'),
      entry('z', '1980-01-01'),
    ];

    expect(uidsOf(pickOrderPair(pool, '2026-10-28'))).toEqual(['y', 'z']);
  });

  it('除く映画は選ばない', () => {
    for (const date of FEBRUARY) {
      expect(uidsOf(pickOrderPair(POOL, date, 'a')), date).not.toContain('a');
    }
  });

  it('並びは公開日の順に偏らない', () => {
    const earlierFirst = FEBRUARY.filter(date => {
      const [first, second] = pickOrderPair(POOL, date)!;
      return first.releaseDate! < second.releaseDate!;
    }).length;

    expect(earlierFirst).toBeGreaterThan(0);
    expect(earlierFirst).toBeLessThan(FEBRUARY.length);
  });

  it('組めないときは何も返さない', () => {
    const pool = [entry('x', '2000-01-01'), entry('y', '2000-02-01')];

    expect(pickOrderPair(pool, '2026-10-28')).toBeUndefined();
  });
});
