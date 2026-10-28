import {describe, expect, it} from 'vitest';
import {
  EMPTY_ORDER_STREAK,
  previousDay,
  recordOrderAnswer,
} from './order-streak';

describe('recordOrderAnswer', () => {
  it('正解なら連続正解数を 1 増やす', () => {
    const streak = recordOrderAnswer(
      {current: 2, best: 5, answeredDates: []},
      '2026-10-28',
      true,
    );

    expect(streak.current).toBe(3);
  });

  it('不正解なら連続正解数を 0 に戻す', () => {
    const streak = recordOrderAnswer(
      {current: 2, best: 5, answeredDates: []},
      '2026-10-28',
      false,
    );

    expect(streak.current).toBe(0);
  });

  it('連続正解数が最高記録を超えたら最高記録を更新する', () => {
    const streak = recordOrderAnswer(
      {current: 5, best: 5, answeredDates: []},
      '2026-10-28',
      true,
    );

    expect(streak.best).toBe(6);
  });

  it('不正解でも最高記録は残す', () => {
    const streak = recordOrderAnswer(
      {current: 5, best: 8, answeredDates: []},
      '2026-10-28',
      false,
    );

    expect(streak.best).toBe(8);
  });

  it('答えた日の問題を覚える', () => {
    const streak = recordOrderAnswer(EMPTY_ORDER_STREAK, '2026-10-28', true);

    expect(streak.answeredDates).toEqual(['2026-10-28']);
  });

  it('同じ日の問題の 2 回目以降は数えない', () => {
    const before = {current: 3, best: 3, answeredDates: ['2026-10-28']};

    expect(recordOrderAnswer(before, '2026-10-28', true)).toBe(before);
  });
});

describe('previousDay', () => {
  it('前の日を返す', () => {
    expect(previousDay('2026-10-28')).toBe('2026-10-27');
  });

  it('月をまたぐ', () => {
    expect(previousDay('2026-03-01')).toBe('2026-02-28');
  });
});
