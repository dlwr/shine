/* eslint-disable unicorn/no-null */
import {describe, expect, it} from 'vitest';
import {formatDateRange, formatYearAndNumber} from './format';

describe('formatYearAndNumber', () => {
  it('回次があれば年と回次を返す', () => {
    expect(formatYearAndNumber(2024, 96)).toBe('2024年（第96回）');
  });

  it('回次がなければ年だけを返す', () => {
    expect(formatYearAndNumber(2024, null)).toBe('2024年');
  });

  it('回次が0なら年だけを返す', () => {
    expect(formatYearAndNumber(2024, 0)).toBe('2024年');
  });
});

describe('formatDateRange', () => {
  const start = 1_710_000_000;
  const end = 1_710_086_400;

  it('開始日と終了日があれば期間を返す', () => {
    expect(formatDateRange(start, end)).toBe(
      `${new Date(start * 1000).toLocaleDateString('ja-JP')} 〜 ${new Date(
        end * 1000,
      ).toLocaleDateString('ja-JP')}`,
    );
  });

  it('開始日だけなら開始日を返す', () => {
    expect(formatDateRange(start, null)).toBe(
      new Date(start * 1000).toLocaleDateString('ja-JP'),
    );
  });

  it('終了日だけなら終了日を返す', () => {
    expect(formatDateRange(null, end)).toBe(
      new Date(end * 1000).toLocaleDateString('ja-JP'),
    );
  });

  it('どちらもなければハイフンを返す', () => {
    expect(formatDateRange(null, null)).toBe('-');
  });
});
