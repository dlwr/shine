import {describe, expect, it} from 'vitest';

// Test helper functions that would be in the main app
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

describe('Utility Functions', () => {
	describe('simpleHash', () => {
		it('should return consistent hash for same input', () => {
			const input = 'test-string';
			const hash1 = simpleHash(input);
			const hash2 = simpleHash(input);
			expect(hash1).toBe(hash2);
		});

		it('should return different hash for different inputs', () => {
			const hash1 = simpleHash('test1');
			const hash2 = simpleHash('test2');
			expect(hash1).not.toBe(hash2);
		});

		it('should return positive number', () => {
			const hash = simpleHash('test');
			expect(hash).toBeGreaterThanOrEqual(0);
		});

		it('should handle empty string', () => {
			const hash = simpleHash('');
			expect(hash).toBe(0);
		});

		it('should handle unicode characters', () => {
			const hash = simpleHash('テスト');
			expect(typeof hash).toBe('number');
			expect(hash).toBeGreaterThanOrEqual(0);
		});
	});

	describe('getSelectionDate', () => {
		describe('daily selection', () => {
			it('should return YYYY-MM-DD format for daily selection', () => {
				const date = new Date('2024-06-15');
				const result = getSelectionDate(date, 'daily');
				expect(result).toBe('2024-06-15');
			});

			it('should pad single digit months and days', () => {
				const date = new Date('2024-01-05');
				const result = getSelectionDate(date, 'daily');
				expect(result).toBe('2024-01-05');
			});
		});

		describe('weekly selection', () => {
			it('should return Friday date for weekly selection', () => {
				// Monday June 17, 2024 should return Friday June 14, 2024
				const date = new Date('2024-06-17'); // Monday
				const result = getSelectionDate(date, 'weekly');
				expect(result).toBe('2024-06-14');
			});

			it('should return same date if already Friday', () => {
				const date = new Date('2024-06-14'); // Friday
				const result = getSelectionDate(date, 'weekly');
				expect(result).toBe('2024-06-14');
			});

			it('should return previous Friday for Saturday', () => {
				const date = new Date('2024-06-15'); // Saturday
				const result = getSelectionDate(date, 'weekly');
				expect(result).toBe('2024-06-14');
			});

			it('should return previous Friday for Sunday', () => {
				const date = new Date('2024-06-16'); // Sunday
				const result = getSelectionDate(date, 'weekly');
				expect(result).toBe('2024-06-14');
			});
		});

		describe('monthly selection', () => {
			it('should return first day of month for monthly selection', () => {
				const date = new Date('2024-06-15');
				const result = getSelectionDate(date, 'monthly');
				expect(result).toBe('2024-06-01');
			});

			it('should handle end of month', () => {
				const date = new Date('2024-06-30');
				const result = getSelectionDate(date, 'monthly');
				expect(result).toBe('2024-06-01');
			});

			it('should handle leap year February', () => {
				const date = new Date('2024-02-29');
				const result = getSelectionDate(date, 'monthly');
				expect(result).toBe('2024-02-01');
			});
		});
	});
});
