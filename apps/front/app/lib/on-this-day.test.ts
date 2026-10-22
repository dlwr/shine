import {describe, expect, it} from 'vitest';
import {
  formatMonthDay,
  isMonthDay,
  monthDayInJapan,
  shiftMonthDay,
} from './on-this-day';

describe('monthDayInJapan', () => {
  it('日本時間の月日を返す', () => {
    expect(monthDayInJapan(new Date('2026-09-14T15:00:00Z'))).toBe('09-15');
  });

  it('日本時間で日付が変わる前は前日の月日を返す', () => {
    expect(monthDayInJapan(new Date('2026-09-14T14:59:59Z'))).toBe('09-14');
  });
});

describe('isMonthDay', () => {
  it('うるう日を受け付ける', () => {
    expect(isMonthDay('02-29')).toBe(true);
  });

  it.each(['13-01', '02-30', '00-10', '9-15', ''])(
    '%s は受け付けない',
    value => {
      expect(isMonthDay(value)).toBe(false);
    },
  );
});

describe('shiftMonthDay', () => {
  it('翌日に進める', () => {
    expect(shiftMonthDay('09-15', 1)).toBe('09-16');
  });

  it('うるう日を通って翌月に進める', () => {
    expect(shiftMonthDay('02-29', 1)).toBe('03-01');
  });

  it('年をまたいで前日に戻る', () => {
    expect(shiftMonthDay('01-01', -1)).toBe('12-31');
  });
});

describe('formatMonthDay', () => {
  it('日本語の月日にする', () => {
    expect(formatMonthDay('09-05')).toBe('9月5日');
  });
});
