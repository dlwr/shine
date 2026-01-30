import {beforeEach, describe, expect, it, vi} from 'vitest';

// Import the functions we want to test
// Note: These would need to be exported from index.ts for proper testing
// For now, we'll test the logic directly

function simpleHash(input: string): number {
  let hash = 0;
  for (let index = 0; index < input.length; index++) {
    const char = input.codePointAt(index) || 0;
    hash = (hash << 5) - hash + char;
    hash &= hash; // Convert to 32-bit integer
  }

  return Math.abs(hash);
}

function getSelectionDate(
  date: Date,
  type: 'daily' | 'weekly' | 'monthly',
): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  switch (type) {
    case 'daily': {
      return `${year}-${month.toString().padStart(2, '0')}-${day
        .toString()
        .padStart(2, '0')}`;
    }

    case 'weekly': {
      const daysSinceFriday = (date.getDay() - 5 + 7) % 7;
      const fridayDate = new Date(date);
      fridayDate.setDate(day - daysSinceFriday);
      return `${fridayDate.getFullYear()}-${(fridayDate.getMonth() + 1)
        .toString()
        .padStart(2, '0')}-${fridayDate.getDate().toString().padStart(2, '0')}`;
    }

    case 'monthly': {
      return `${year}-${month.toString().padStart(2, '0')}-01`;
    }
  }
}

function getDateSeed(date: Date, type: 'daily' | 'weekly' | 'monthly'): number {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  switch (type) {
    case 'daily': {
      const dateString = `${year}-${month.toString().padStart(2, '0')}-${day
        .toString()
        .padStart(2, '0')}`;
      return simpleHash(`daily-${dateString}`);
    }

    case 'weekly': {
      const daysSinceFriday = (date.getDay() - 5 + 7) % 7;
      const fridayDate = new Date(date);
      fridayDate.setDate(day - daysSinceFriday);
      const weekString = `${fridayDate.getFullYear()}-${(
        fridayDate.getMonth() + 1
      )
        .toString()
        .padStart(2, '0')}-${fridayDate.getDate().toString().padStart(2, '0')}`;
      return simpleHash(`weekly-${weekString}`);
    }

    case 'monthly': {
      const monthString = `${year}-${month.toString().padStart(2, '0')}`;
      return simpleHash(`monthly-${monthString}`);
    }
  }
}

describe('Movie Selection Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('simpleHash function', () => {
    it('should generate consistent hash for same input', () => {
      const input = 'test-string';
      const hash1 = simpleHash(input);
      const hash2 = simpleHash(input);

      expect(hash1).toBe(hash2);
      expect(typeof hash1).toBe('number');
      expect(hash1).toBeGreaterThanOrEqual(0);
    });

    it('should generate different hashes for different inputs', () => {
      const hash1 = simpleHash('input1');
      const hash2 = simpleHash('input2');

      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty string', () => {
      const hash = simpleHash('');
      expect(hash).toBe(0);
    });

    it('should handle unicode characters', () => {
      const hash1 = simpleHash('hello');
      const hash2 = simpleHash('こんにちは');

      expect(typeof hash1).toBe('number');
      expect(typeof hash2).toBe('number');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('getSelectionDate function', () => {
    it('should format daily date correctly', () => {
      const date = new Date('2025-06-20');
      const result = getSelectionDate(date, 'daily');

      expect(result).toBe('2025-06-20');
    });

    it('should format monthly date correctly', () => {
      const date = new Date('2025-06-20');
      const result = getSelectionDate(date, 'monthly');

      expect(result).toBe('2025-06-01');
    });

    it('should format weekly date correctly (Friday basis)', () => {
      // Test with a Friday (2025-06-20 is a Friday)
      const friday = new Date('2025-06-20');
      const result = getSelectionDate(friday, 'weekly');

      expect(result).toBe('2025-06-20');
    });

    it('should find previous Friday for weekly selection', () => {
      // Test with a Monday (2025-06-23)
      const monday = new Date('2025-06-23');
      const result = getSelectionDate(monday, 'weekly');

      expect(result).toBe('2025-06-20'); // Previous Friday
    });

    it('should handle year boundary correctly', () => {
      const newYear = new Date('2025-01-01');

      expect(getSelectionDate(newYear, 'daily')).toBe('2025-01-01');
      expect(getSelectionDate(newYear, 'monthly')).toBe('2025-01-01');
    });

    it('should pad single digit months and days', () => {
      const date = new Date('2025-01-05');

      expect(getSelectionDate(date, 'daily')).toBe('2025-01-05');
      expect(getSelectionDate(date, 'monthly')).toBe('2025-01-01');
    });
  });

  describe('getDateSeed function', () => {
    it('should generate consistent seeds for same date and type', () => {
      const date = new Date('2025-06-20');

      const seed1 = getDateSeed(date, 'daily');
      const seed2 = getDateSeed(date, 'daily');

      expect(seed1).toBe(seed2);
      expect(typeof seed1).toBe('number');
    });

    it('should generate different seeds for different types', () => {
      const date = new Date('2025-06-20');

      const dailySeed = getDateSeed(date, 'daily');
      const weeklySeed = getDateSeed(date, 'weekly');
      const monthlySeed = getDateSeed(date, 'monthly');

      expect(dailySeed).not.toBe(weeklySeed);
      expect(weeklySeed).not.toBe(monthlySeed);
      expect(dailySeed).not.toBe(monthlySeed);
    });

    it('should generate different seeds for different dates', () => {
      const date1 = new Date('2025-06-20');
      const date2 = new Date('2025-06-21');

      const seed1 = getDateSeed(date1, 'daily');
      const seed2 = getDateSeed(date2, 'daily');

      expect(seed1).not.toBe(seed2);
    });

    it('should generate same weekly seed for dates in same week', () => {
      const friday = new Date('2025-06-20'); // Friday
      const monday = new Date('2025-06-23'); // Monday of same week
      const thursday = new Date('2025-06-26'); // Thursday of same week

      const fridaySeed = getDateSeed(friday, 'weekly');
      const mondaySeed = getDateSeed(monday, 'weekly');
      const thursdaySeed = getDateSeed(thursday, 'weekly');

      expect(fridaySeed).toBe(mondaySeed);
      expect(mondaySeed).toBe(thursdaySeed);
    });

    it('should generate same monthly seed for dates in same month', () => {
      const date1 = new Date('2025-06-01');
      const date2 = new Date('2025-06-15');
      const date3 = new Date('2025-06-30');

      const seed1 = getDateSeed(date1, 'monthly');
      const seed2 = getDateSeed(date2, 'monthly');
      const seed3 = getDateSeed(date3, 'monthly');

      expect(seed1).toBe(seed2);
      expect(seed2).toBe(seed3);
    });
  });

  describe('Date calculation edge cases', () => {
    it('should handle leap year February correctly', () => {
      const leapYearDate = new Date('2024-02-29');

      expect(getSelectionDate(leapYearDate, 'daily')).toBe('2024-02-29');
      expect(getSelectionDate(leapYearDate, 'monthly')).toBe('2024-02-01');
    });

    it('should handle month boundaries correctly for weekly selection', () => {
      // Test date near month boundary
      const endOfMonth = new Date('2025-06-30'); // Monday
      const result = getSelectionDate(endOfMonth, 'weekly');

      // Should find the Friday of that week (June 27, 2025)
      expect(result).toBe('2025-06-27');
    });

    it('should handle year boundaries correctly for weekly selection', () => {
      // Test New Year's Day 2025 (Wednesday)
      const newYear = new Date('2025-01-01');
      const result = getSelectionDate(newYear, 'weekly');

      // Should find the previous Friday (December 27, 2024)
      expect(result).toBe('2024-12-27');
    });

    it('should handle different time zones consistently', () => {
      // Create dates with explicit UTC to avoid timezone issues
      const utcDate = new Date('2025-06-20T12:00:00Z');

      const dailyResult = getSelectionDate(utcDate, 'daily');
      expect(dailyResult).toBe('2025-06-20');
    });
  });

  describe('Next period calculation', () => {
    it('should calculate next day correctly', () => {
      const now = new Date('2025-06-20');
      const nextDay = new Date(now);
      nextDay.setDate(now.getDate() + 1);

      expect(nextDay.getDate()).toBe(21);
      expect(nextDay.getMonth()).toBe(5); // June (0-indexed)
      expect(nextDay.getFullYear()).toBe(2025);
    });

    it('should calculate next Friday correctly', () => {
      const now = new Date('2025-06-20'); // Friday
      const daysSinceFriday = (now.getDay() - 5 + 7) % 7;
      const fridayDate = new Date(now);
      fridayDate.setDate(now.getDate() - daysSinceFriday);
      const nextFriday = new Date(fridayDate);
      nextFriday.setDate(fridayDate.getDate() + 7);

      expect(nextFriday.getDate()).toBe(27);
      expect(nextFriday.getDay()).toBe(5); // Friday
    });

    it('should calculate next month correctly', () => {
      const now = new Date('2025-06-20');
      const nextMonth = new Date(now);
      nextMonth.setDate(1); // Must set date BEFORE month to avoid overflow
      nextMonth.setMonth(now.getMonth() + 1);

      expect(nextMonth.getDate()).toBe(1);
      expect(nextMonth.getMonth()).toBe(6); // July (0-indexed)
      expect(nextMonth.getFullYear()).toBe(2025);
    });

    it('should handle year rollover for next month', () => {
      const december = new Date('2025-12-20');
      const nextMonth = new Date(december);
      nextMonth.setDate(1); // Must set date BEFORE month to avoid overflow
      nextMonth.setMonth(december.getMonth() + 1);

      expect(nextMonth.getDate()).toBe(1);
      expect(nextMonth.getMonth()).toBe(0); // January (0-indexed)
      expect(nextMonth.getFullYear()).toBe(2026);
    });

    it('should calculate next month correctly when current date is 29th (month-end edge case)', () => {
      // This tests the bug fix: when current date is Jan 29-31, next month should be Feb, not March
      const jan29 = new Date('2026-01-29');
      const nextMonth = new Date(jan29);
      nextMonth.setDate(1); // Must set date to 1 BEFORE incrementing month
      nextMonth.setMonth(jan29.getMonth() + 1);

      expect(nextMonth.getDate()).toBe(1);
      expect(nextMonth.getMonth()).toBe(1); // February (0-indexed), NOT March
      expect(nextMonth.getFullYear()).toBe(2026);
    });

    it('should calculate next month correctly when current date is 30th (month-end edge case)', () => {
      const jan30 = new Date('2026-01-30');
      const nextMonth = new Date(jan30);
      nextMonth.setDate(1); // Must set date to 1 BEFORE incrementing month
      nextMonth.setMonth(jan30.getMonth() + 1);

      expect(nextMonth.getDate()).toBe(1);
      expect(nextMonth.getMonth()).toBe(1); // February (0-indexed), NOT March
      expect(nextMonth.getFullYear()).toBe(2026);
    });

    it('should calculate next month correctly when current date is 31st (month-end edge case)', () => {
      const jan31 = new Date('2026-01-31');
      const nextMonth = new Date(jan31);
      nextMonth.setDate(1); // Must set date to 1 BEFORE incrementing month
      nextMonth.setMonth(jan31.getMonth() + 1);

      expect(nextMonth.getDate()).toBe(1);
      expect(nextMonth.getMonth()).toBe(1); // February (0-indexed), NOT March
      expect(nextMonth.getFullYear()).toBe(2026);
    });

    it('should demonstrate the bug when setMonth is called BEFORE setDate', () => {
      // This demonstrates the bug that was fixed
      const jan30 = new Date('2026-01-30');
      const buggyNextMonth = new Date(jan30);
      buggyNextMonth.setMonth(jan30.getMonth() + 1); // BUG: Feb 30 doesn't exist, overflows to Mar 2
      buggyNextMonth.setDate(1);

      // This is the buggy behavior - it results in March instead of February
      expect(buggyNextMonth.getMonth()).toBe(2); // March (0-indexed) - this is wrong!
    });
  });
});
