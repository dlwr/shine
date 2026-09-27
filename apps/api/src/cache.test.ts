import {beforeEach, describe, expect, it} from 'vitest';
import {
  shouldCheckETag,
  createCachedResponse,
  createETag,
  EdgeCache,
  getCacheKeyForPerson,
  getCacheKeyForSelection,
  getCacheTTL,
} from './utils/cache';

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
      expect(key1).toMatch(/^selections:daily:2024-06-24:en:v4$/);
    });

    it('人物のキャッシュキーにロケールを含める', () => {
      expect(getCacheKeyForPerson('person-1', 'ja')).toBe(
        'person:person-1:ja:v6',
      );
      expect(getCacheKeyForPerson('person-1', 'en')).toBe(
        'person:person-1:en:v6',
      );
    });
  });

  describe('Cache TTL Configuration', () => {
    it('should have appropriate TTL values', () => {
      expect(getCacheTTL.selections.daily).toBe(3600); // 1 hour
      expect(getCacheTTL.selections.weekly).toBe(21_600); // 6 hours
      expect(getCacheTTL.selections.monthly).toBe(86_400); // 24 hours
      expect(getCacheTTL.movie.details).toBe(86_400); // 24 hours
      expect(getCacheTTL.search.results).toBe(86_400); // 24 hours
    });

    it('should have longer TTL for less frequently changing data', () => {
      expect(getCacheTTL.movie.details).toBeGreaterThan(
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

      expect(shouldCheckETag(mockRequest, etag)).toBe(true);

      // Mock request with different ETag
      const mockRequestDifferent = {
        header: (name: string) =>
          name === 'If-None-Match' ? '"different"' : undefined,
      };

      expect(shouldCheckETag(mockRequestDifferent, etag)).toBe(false);
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

    it('should handle cache errors gracefully', async () => {
      // Test with invalid key that might cause errors
      const invalidKey = '';

      // Should not throw errors
      await expect(cache.get(invalidKey)).resolves.toBeUndefined();
      await expect(cache.delete(invalidKey)).resolves.toBe(false);
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

  describe('Cache Performance Expectations', () => {
    it('should have reasonable TTL values for production use', () => {
      // Daily selections: 1 hour (reasonable for content that changes daily)
      expect(getCacheTTL.selections.daily).toBe(3600);

      // Movie details: 24 hours (movie data rarely changes)
      expect(getCacheTTL.movie.details).toBe(86_400);

      // URL titles: 1 week (URLs don't change their titles)
      expect(getCacheTTL.utility.urlTitle).toBe(604_800);
    });

    it('should prioritize high-frequency endpoints with appropriate caching', () => {
      // Main selections endpoint (/) - highest frequency, moderate TTL
      const selectionsTTL = getCacheTTL.selections.daily;

      // Movie details - medium frequency, longer TTL
      const movieTTL = getCacheTTL.movie.details;

      // Selections should refresh more frequently than movie details
      expect(movieTTL).toBeGreaterThan(selectionsTTL);
    });
  });
});
