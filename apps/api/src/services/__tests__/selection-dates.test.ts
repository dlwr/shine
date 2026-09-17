import {describe, expect, it} from 'vitest';
import {getSelectionDate, nextSelectionDates} from '../selection-dates';

function nextDates(now: Date) {
  const dates = nextSelectionDates(now);
  return {
    daily: getSelectionDate(dates.daily, 'daily'),
    weekly: getSelectionDate(dates.weekly, 'weekly'),
    monthly: getSelectionDate(dates.monthly, 'monthly'),
  };
}

describe('nextSelectionDates', () => {
  it('日替わりは翌日', () => {
    expect(nextDates(new Date(2026, 8, 17, 12)).daily).toBe('2026-09-18');
  });

  it('日替わりは月をまたぐ', () => {
    expect(nextDates(new Date(2026, 11, 31, 12)).daily).toBe('2027-01-01');
  });

  it('週替わりは木曜なら翌日の金曜', () => {
    expect(nextDates(new Date(2026, 8, 17, 12)).weekly).toBe('2026-09-18');
  });

  it('週替わりは金曜なら翌週の金曜', () => {
    expect(nextDates(new Date(2026, 8, 18, 12)).weekly).toBe('2026-09-25');
  });

  it('月替わりは翌月の1日', () => {
    expect(nextDates(new Date(2026, 8, 17, 12)).monthly).toBe('2026-10-01');
  });

  it('月替わりは31日からでも翌月を飛ばさない', () => {
    expect(nextDates(new Date(2026, 0, 31, 12)).monthly).toBe('2026-02-01');
  });

  it('月替わりは12月なら翌年の1月', () => {
    expect(nextDates(new Date(2026, 11, 31, 12)).monthly).toBe('2027-01-01');
  });
});
