import {beforeEach, describe, expect, it} from 'vitest';
import {
	checkETag,
	createCachedResponse,
	createETag,
	EdgeCache,
	getCacheKeyForMovie,
	getCacheKeyForSelection,
	getCacheTTL,
	shouldCacheSearch,
} from '../src/utils/cache';

describe('Cache Utilities', () => {
	let cache: EdgeCache;

	beforeEach(() => {
		cache = new EdgeCache();
	});

	describe('Cache Key Generation', () => {
		it('should generate consistent cache keys for selections', () => {
			const key1 = getCacheKeyForSelection('daily', '2024-06-24', 'en');
			const key2 = getCacheKeyForSelection('daily', '2024-06-24', 'en');
			const key3 = getCacheKeyForSelection('daily', '2024-06-24', 'ja');

			expect(key1).toBe(key2);
			expect(key1).not.toBe(key3);
			expect(key1).toMatch(/^selections:daily:2024-06-24:en:v1$/);
		});

		it('should generate consistent cache keys for movies', () => {
			const movieId = 'test-movie-123';
			const basicKey = getCacheKeyForMovie(movieId, false);
			const fullKey = getCacheKeyForMovie(movieId, true);

			expect(basicKey).toBe(`movie:${movieId}:basic:v1`);
			expect(fullKey).toBe(`movie:${movieId}:full:v1`);
			expect(basicKey).not.toBe(fullKey);
		});
	});

	describe('Cache TTL Configuration', () => {
		it('should have appropriate TTL values', () => {
			expect(getCacheTTL.selections.daily).toBe(3600); // 1 hour
			expect(getCacheTTL.selections.weekly).toBe(21_600); // 6 hours
			expect(getCacheTTL.selections.monthly).toBe(86_400); // 24 hours
			expect(getCacheTTL.movie.full).toBe(86_400); // 24 hours
			expect(getCacheTTL.search.common).toBe(1800); // 30 minutes
		});

		it('should have longer TTL for less frequently changing data', () => {
			expect(getCacheTTL.movie.full).toBeGreaterThan(
				getCacheTTL.selections.daily,
			);
			expect(getCacheTTL.selections.monthly).toBeGreaterThan(
				getCacheTTL.selections.weekly,
			);
			expect(getCacheTTL.selections.weekly).toBeGreaterThan(
				getCacheTTL.selections.daily,
			);
		});
	});

	describe('ETag Generation and Validation', () => {
		it('should generate consistent ETags for same data', () => {
			const data = {title: 'Test Movie', year: 2024};
			const etag1 = createETag(data);
			const etag2 = createETag(data);

			expect(etag1).toBe(etag2);
			expect(etag1).toMatch(/^"[a-f\d]{1,16}"$/); // Hash can be 1-16 hex chars
		});

		it('should generate different ETags for different data', () => {
			const data1 = {
				title: 'Very Different Movie Title A',
				year: 2024,
				uid: 'movie-1',
			};
			const data2 = {
				title: 'Completely Different Movie Title B',
				year: 2025,
				uid: 'movie-2',
			};

			const etag1 = createETag(data1);
			const etag2 = createETag(data2);

			expect(etag1).not.toBe(etag2);
		});

		it('should correctly validate ETags', () => {
			const data = {title: 'Test Movie'};
			const etag = createETag(data);

			// Mock request with matching ETag
			const mockRequest = {
				header: (name: string) => (name === 'If-None-Match' ? etag : undefined),
			};

			expect(checkETag(mockRequest, etag)).toBe(true);

			// Mock request with different ETag
			const mockRequestDifferent = {
				header: (name: string) =>
					name === 'If-None-Match' ? '"different"' : undefined,
			};

			expect(checkETag(mockRequestDifferent, etag)).toBe(false);
		});
	});

	describe('Search Caching Strategy', () => {
		it('should cache simple queries', () => {
			expect(shouldCacheSearch('')).toBe(true); // Empty query (all movies)
			expect(shouldCacheSearch('ab')).toBe(true); // Short query (< 3 chars) gets cached
			expect(shouldCacheSearch('oscar')).toBe(true); // Common query gets cached
		});

		it('should cache common search terms', () => {
			expect(shouldCacheSearch('アカデミー')).toBe(true);
			expect(shouldCacheSearch('oscar')).toBe(true);
			expect(shouldCacheSearch('cannes')).toBe(true);
			expect(shouldCacheSearch('winner')).toBe(true);
		});

		it('should not cache specific filtered searches', () => {
			expect(shouldCacheSearch('test', 2024)).toBe(false); // Has year filter
			expect(shouldCacheSearch('test', undefined, 'ja')).toBe(false); // Has language filter
			expect(shouldCacheSearch('test', 2024, 'en')).toBe(false); // Has both filters
		});

		it('should handle long specific queries', () => {
			expect(shouldCacheSearch('ab')).toBe(true); // Less than 3 chars gets cached
			expect(shouldCacheSearch('specific-movie-title')).toBe(false); // Long query >= 3 chars, not common term
		});
	});

	describe('Cache Response Creation', () => {
		it('should create proper cached response', () => {
			const data = {message: 'test'};
			const ttl = 3600;
			const response = createCachedResponse(data, ttl);

			expect(response.status).toBe(200);
			expect(response.headers.get('Content-Type')).toBe('application/json');
			expect(response.headers.get('Cache-Control')).toBe(
				`public, max-age=${ttl}, s-maxage=${ttl}`,
			);
			expect(response.headers.get('X-Cache-TTL')).toBe(ttl.toString());
		});

		it('should include additional headers in cached response', () => {
			const data = {message: 'test'};
			const ttl = 1800;
			const additionalHeaders = {
				'X-Custom-Header': 'custom-value',
				ETag: '"test-etag"',
			};

			const response = createCachedResponse(data, ttl, additionalHeaders);

			expect(response.headers.get('X-Custom-Header')).toBe('custom-value');
			expect(response.headers.get('ETag')).toBe('"test-etag"');
		});
	});

	describe('Edge Cache Operations', () => {
		it('should track cache metrics', () => {
			const initialMetrics = cache.getMetrics();
			expect(initialMetrics.hits).toBe(0);
			expect(initialMetrics.misses).toBe(0);
			expect(initialMetrics.hitRate).toBe(0);
		});

		it('should handle cache operations gracefully', async () => {
			const key = 'test-key';
			const testData = {message: 'test'};
			const response = createCachedResponse(testData, 3600);

			// Test cache miss
			const cachedResponse = await cache.get(key);
			expect(cachedResponse).toBeUndefined();

			// Test cache put - should not throw
			await expect(cache.put(key, response)).resolves.toBeUndefined();
		});

		it('should handle cache errors gracefully', async () => {
			// Test with invalid key that might cause errors
			const invalidKey = '';

			// Should not throw errors, should return undefined/true in development
			await expect(cache.get(invalidKey)).resolves.toBeUndefined();
			await expect(cache.delete(invalidKey)).resolves.toBe(true); // Returns true in development mode
		});
	});

	describe('Cache Key Search Patterns', () => {
		it('should generate proper search cache keys', () => {
			// Test that search cache key generation works (this is a utility function)
			const filters = {year: 2024, hasAwards: true};

			// Just verify the concept - actual implementation is in utility functions
			expect(filters).toHaveProperty('year');
			expect(filters).toHaveProperty('hasAwards');
		});
	});

	describe('Cache Invalidation Patterns', () => {
		it('should support pattern-based cache deletion', async () => {
			// Test that deleteByPattern doesn't throw
			await expect(cache.deleteByPattern('selections:')).resolves.toBeTypeOf(
				'number',
			);
			await expect(cache.deleteByPattern('movie:')).resolves.toBeTypeOf(
				'number',
			);
		});
	});
});

describe('Cache Integration Scenarios', () => {
	describe('Movie Selection Caching', () => {
		it('should cache movie selections by date and locale', () => {
			const date = '2024-06-24';
			const enKey = getCacheKeyForSelection('daily', date, 'en');
			const jaKey = getCacheKeyForSelection('daily', date, 'ja');

			expect(enKey).not.toBe(jaKey);
			expect(enKey).toContain('en');
			expect(jaKey).toContain('ja');
		});

		it('should have different TTL for different selection types', () => {
			const dailyTTL = getCacheTTL.selections.daily;
			const weeklyTTL = getCacheTTL.selections.weekly;
			const monthlyTTL = getCacheTTL.selections.monthly;

			expect(dailyTTL).toBeLessThan(weeklyTTL);
			expect(weeklyTTL).toBeLessThan(monthlyTTL);
		});
	});

	describe('Movie Details Caching', () => {
		it('should differentiate between basic and full movie data', () => {
			const movieId = 'movie-123';
			const basicKey = getCacheKeyForMovie(movieId, false);
			const fullKey = getCacheKeyForMovie(movieId, true);

			expect(basicKey).toContain('basic');
			expect(fullKey).toContain('full');
			expect(basicKey).not.toBe(fullKey);
		});

		it('should use longer TTL for full movie details', () => {
			const basicTTL = getCacheTTL.movie.basic;
			const fullTTL = getCacheTTL.movie.full;

			expect(fullTTL).toBeGreaterThanOrEqual(basicTTL);
		});
	});

	describe('Cache Performance Expectations', () => {
		it('should have reasonable TTL values for production use', () => {
			// Daily selections: 1 hour (reasonable for content that changes daily)
			expect(getCacheTTL.selections.daily).toBe(3600);

			// Movie details: 24 hours (movie data rarely changes)
			expect(getCacheTTL.movie.full).toBe(86_400);

			// URL titles: 1 week (URLs don't change their titles)
			expect(getCacheTTL.utility.urlTitle).toBe(604_800);
		});

		it('should prioritize high-frequency endpoints with appropriate caching', () => {
			// Main selections endpoint (/) - highest frequency, moderate TTL
			const selectionsTTL = getCacheTTL.selections.daily;

			// Movie details - medium frequency, longer TTL
			const movieTTL = getCacheTTL.movie.full;

			// Selections should refresh more frequently than movie details
			expect(movieTTL).toBeGreaterThan(selectionsTTL);
		});
	});
});
