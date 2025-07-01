import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildUrl, fetchWithRetry } from "../common/fetch-utilities";

// Mock fetch globally
globalThis.fetch = vi.fn();

describe("Fetch Utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("fetchWithRetry", () => {
    it("should fetch successfully on first try", async () => {
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue("success"),
      };
      vi.mocked(fetch).mockResolvedValue(mockResponse as unknown as Response);

      const result = await fetchWithRetry("https://example.com");

      expect(fetch).toHaveBeenCalledWith("https://example.com", {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
        },
      });
      expect(result).toBe("success");
    });

    it("should include custom headers", async () => {
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue("success"),
      };
      vi.mocked(fetch).mockResolvedValue(mockResponse as unknown as Response);

      await fetchWithRetry("https://example.com", {
        headers: { "Custom-Header": "custom-value" },
      });

      expect(fetch).toHaveBeenCalledWith("https://example.com", {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
          "Custom-Header": "custom-value",
        },
      });
    });

    it("should retry on HTTP error", async () => {
      const mockErrorResponse = {
        ok: false,
        status: 500,
      };
      const mockSuccessResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue("success"),
      };

      vi.mocked(fetch)
        .mockResolvedValueOnce(mockErrorResponse as unknown as Response)
        .mockResolvedValueOnce(mockSuccessResponse as unknown as Response);

      const result = await fetchWithRetry("https://example.com", {}, 2, 10);

      expect(fetch).toHaveBeenCalledTimes(2);
      expect(result).toBe("success");
    });

    it("should retry on network error", async () => {
      vi.mocked(fetch)
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce({
          ok: true,
          text: vi.fn().mockResolvedValue("success"),
        } as unknown as Response);

      const result = await fetchWithRetry("https://example.com", {}, 2, 10);

      expect(fetch).toHaveBeenCalledTimes(2);
      expect(result).toBe("success");
    });

    it("should throw error after exhausting retries", async () => {
      const mockErrorResponse = {
        ok: false,
        status: 500,
      };
      vi.mocked(fetch).mockResolvedValue(
        mockErrorResponse as unknown as Response,
      );

      await expect(
        fetchWithRetry("https://example.com", {}, 2, 10),
      ).rejects.toThrow("HTTP error! Status: 500");

      expect(fetch).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it("should increase delay between retries", async () => {
      const mockErrorResponse = {
        ok: false,
        status: 500,
      };
      vi.mocked(fetch).mockResolvedValue(
        mockErrorResponse as unknown as Response,
      );

      const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

      try {
        await fetchWithRetry("https://example.com", {}, 2, 100);
      } catch {
        // Expected to fail
      }

      // Should have called setTimeout for delays
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 100);
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 150); // 100 * 1.5

      setTimeoutSpy.mockRestore();
    });
  });

  describe("buildUrl", () => {
    it("should build URL with query parameters", () => {
      const result = buildUrl("https://example.com", {
        param1: "value1",
        param2: "value2",
      });

      expect(result).toBe("https://example.com/?param1=value1&param2=value2");
    });

    it("should handle empty parameters", () => {
      const result = buildUrl("https://example.com", {});

      expect(result).toBe("https://example.com/");
    });

    it("should URL encode parameters", () => {
      const result = buildUrl("https://example.com", {
        query: "hello world",
        special: "a&b=c",
      });

      expect(result).toBe(
        "https://example.com/?query=hello+world&special=a%26b%3Dc",
      );
    });

    it("should handle existing query parameters", () => {
      const result = buildUrl("https://example.com?existing=param", {
        new: "value",
      });

      expect(result).toBe("https://example.com/?existing=param&new=value");
    });

    it("should handle Japanese characters", () => {
      const result = buildUrl("https://example.com", {
        query: "テスト映画",
      });

      expect(result).toContain(
        "query=%E3%83%86%E3%82%B9%E3%83%88%E6%98%A0%E7%94%BB",
      );
    });

    it("should handle multiple values for same key", () => {
      const url = new URL("https://example.com");
      url.searchParams.append("tag", "movie");
      url.searchParams.append("tag", "drama");

      // Test the function doesn't duplicate keys when called multiple times
      const result = buildUrl("https://example.com", {
        tag: "action",
      });

      expect(result).toBe("https://example.com/?tag=action");
    });
  });
});
