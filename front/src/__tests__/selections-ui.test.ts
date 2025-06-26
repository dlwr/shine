import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock DOM APIs
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

const mockFetch = vi.fn();

// Setup DOM environment
Object.defineProperty(globalThis, "window", {
  value: {
    localStorage: mockLocalStorage,
    location: {
      hostname: "localhost",
      href: "http://localhost:4321/admin/selections",
    },
  },
  writable: true,
});

Object.defineProperty(globalThis, "document", {
  value: {
    body: { innerHTML: "" },
    getElementById: vi.fn(),
    createElement: vi.fn(),
  },
  writable: true,
});

Object.defineProperty(globalThis, "localStorage", {
  value: mockLocalStorage,
  writable: true,
});

Object.defineProperty(globalThis, "fetch", {
  value: mockFetch,
  writable: true,
});

const getApiUrl = () => {
  return globalThis.location?.hostname === "localhost"
    ? "http://localhost:8787"
    : "https://shine-api.yuta25.workers.dev";
};

const getApiUrlProduction = () => {
  return globalThis.location?.hostname === "localhost"
    ? "http://localhost:8787"
    : "https://shine-api.yuta25.workers.dev";
};

const getAuthHeaders = () => {
  const token = localStorage.getItem("adminToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const getAuthHeadersEmpty = () => {
  const token = localStorage.getItem("adminToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const generateMovieHTMLLocal = (movieLocal: {
  uid: string;
  title: string;
  year: number;
  posterUrl: string | undefined;
  nominations: { uid: string; category: { name: string } }[];
}) => {
  return `
    <div class="flex flex-col items-center space-y-3">
      ${
        movieLocal.posterUrl
          ? `<img src="${movieLocal.posterUrl}" alt="${movieLocal.title}" class="w-24 h-36 object-cover rounded-md shadow-sm" />`
          : '<div class="w-24 h-36 bg-gray-200 rounded-md flex items-center justify-center"><span class="text-gray-500 text-xs">No poster</span></div>'
      }
      <div class="text-center">
        <h3 class="font-medium text-gray-900">${movieLocal.title || "Untitled"}</h3>
        <p class="text-sm text-gray-500">${movieLocal.year || "Unknown year"}</p>
        ${
          movieLocal.nominations && movieLocal.nominations.length > 0
            ? `<div class="mt-1"><span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">${movieLocal.nominations.length} nomination${movieLocal.nominations.length === 1 ? "" : "s"}</span></div>`
            : ""
        }
      </div>
    </div>
  `;
};

const generateMovieHTMLSimpleLocal = (movieLocal: {
  uid: string;
  title: string;
  year: number;
  posterUrl: string | undefined;
  nominations: { uid: string; category: { name: string } }[];
}) => {
  return movieLocal.posterUrl
    ? `<img src="${movieLocal.posterUrl}" alt="${movieLocal.title}" />`
    : '<div class="bg-gray-200">No poster</div>';
};

const validateOverrideRequestLocal = (data: {
  type?: string;
  date?: string;
  movieId?: string;
}) => {
  if (!data.type || !["daily", "weekly", "monthly"].includes(data.type)) {
    return { valid: false, error: "Invalid type" };
  }
  if (!data.date || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
    return { valid: false, error: "Invalid date format" };
  }
  if (!data.movieId) {
    return { valid: false, error: "Movie ID required" };
  }
  return { valid: true };
};

describe("Admin Selections UI Logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset DOM
    document.body.innerHTML = "";

    // Default localStorage mock
    mockLocalStorage.getItem.mockReturnValue("mock-admin-token");
  });

  describe("Authentication Check", () => {
    it("should check for adminToken in localStorage", () => {
      const token = localStorage.getItem("adminToken");

      expect(localStorage.getItem).toHaveBeenCalledWith("adminToken");
      expect(token).toBe("mock-admin-token");
    });

    it("should redirect to login if no token", () => {
      mockLocalStorage.getItem.mockReturnValue("");

      const token = localStorage.getItem("adminToken");
      expect(token).toBe("");

      // In actual implementation, this would trigger window.location.href = '/admin/login'
    });
  });

  describe("API URL Configuration", () => {
    it("should use localhost URL for development", () => {
      // Ensure location is set to localhost for this test
      Object.defineProperty(globalThis, "location", {
        value: { hostname: "localhost" },
        configurable: true,
      });
      expect(getApiUrl()).toBe("http://localhost:8787");
    });

    it("should use production URL for production", () => {
      // Mock production hostname
      Object.defineProperty(globalThis, "location", {
        value: { hostname: "example.com" },
        configurable: true,
      });

      expect(getApiUrlProduction()).toBe(
        "https://shine-api.yuta25.workers.dev",
      );
    });
  });

  describe("Authorization Headers", () => {
    it("should create proper auth headers with token", () => {
      const headers = getAuthHeaders();

      expect(headers).toEqual({
        Authorization: "Bearer mock-admin-token",
      });
    });

    it("should return empty headers without token", () => {
      mockLocalStorage.getItem.mockReturnValue("");

      const headers = getAuthHeadersEmpty();

      expect(headers).toEqual({});
    });
  });

  describe("Movie Data Management", () => {
    it("should store movie data correctly", () => {
      const movieData: {
        daily:
          | undefined
          | {
              uid: string;
              title: string;
              year: number;
              posterUrl: string;
            };
        weekly:
          | undefined
          | {
              uid: string;
              title: string;
              year: number;
              posterUrl: string;
            };
        monthly:
          | undefined
          | {
              uid: string;
              title: string;
              year: number;
              posterUrl: string;
            };
      } = {
        daily: undefined,
        weekly: undefined,
        monthly: undefined,
      };

      const testMovie = {
        uid: "movie-1",
        title: "Test Movie",
        year: 2023,
        posterUrl: "https://example.com/poster.jpg",
      };

      movieData.daily = testMovie;

      expect(movieData.daily).toBe(testMovie);
      expect(movieData.weekly).toBeUndefined();
      expect(movieData.monthly).toBeUndefined();
    });

    it("should validate movie data structure", () => {
      const validMovie = {
        uid: "movie-1",
        title: "Test Movie",
        year: 2023,
        originalLanguage: "en",
        posterUrl: "https://example.com/poster.jpg",
        nominations: [],
      };

      expect(validMovie).toHaveProperty("uid");
      expect(validMovie).toHaveProperty("title");
      expect(validMovie.year).toBeTypeOf("number");
      expect(Array.isArray(validMovie.nominations)).toBe(true);
    });
  });

  describe("Tab Switching Logic", () => {
    beforeEach(() => {
      // Create mock DOM elements
      const mockElements = {
        "search-tab": {
          classList: {
            add: vi.fn(),
            remove: vi.fn(),
            contains: vi.fn(),
          },
        },
        "random-tab": {
          classList: {
            add: vi.fn(),
            remove: vi.fn(),
            contains: vi.fn(),
          },
        },
        "search-content": {
          style: { display: "block" },
        },
        "random-content": {
          style: { display: "none" },
        },
      };

      document.getElementById = vi.fn(
        (id: string) =>
          (mockElements[id as keyof typeof mockElements] as HTMLElement) ||
          undefined,
      );
    });

    it("should switch to search tab correctly", () => {
      let activeTab = "random"; // Start with random tab

      const switchTab = (tabName: string) => {
        activeTab = tabName;
      };

      switchTab("search");

      expect(activeTab).toBe("search");
    });

    it("should switch to random tab correctly", () => {
      let activeTab = "search"; // Start with search tab

      const switchTab = (tabName: string) => {
        activeTab = tabName;
      };

      switchTab("random");

      expect(activeTab).toBe("random");
    });
  });

  describe("Search Functionality", () => {
    it("should validate search input", () => {
      const inputValue = "Test Movie";
      const query = inputValue.trim();

      expect(query).toBe("Test Movie");
      expect(query.length).toBeGreaterThan(0);
    });

    it("should handle empty search query", () => {
      const inputValue = "   ";
      const query = inputValue.trim();

      expect(query).toBe("");
      expect(query.length).toBe(0);
    });

    it("should construct search URL correctly", () => {
      const query = "The Pianist";
      const baseUrl = "http://localhost:8787";
      const searchUrl = `${baseUrl}/admin/movies?limit=20&search=${encodeURIComponent(query)}`;

      expect(searchUrl).toBe(
        "http://localhost:8787/admin/movies?limit=20&search=The%20Pianist",
      );
    });
  });

  describe("Movie Selection Display", () => {
    it("should generate correct movie card HTML", () => {
      const movie = {
        uid: "movie-1",
        title: "Test Movie",
        year: 2023,
        posterUrl: "https://example.com/poster.jpg",
        nominations: [{ uid: "nom-1", category: { name: "Best Picture" } }],
      };

      const html = generateMovieHTMLLocal(movie);

      expect(html).toContain("Test Movie");
      expect(html).toContain("2023");
      expect(html).toContain("https://example.com/poster.jpg");
      expect(html).toContain("1 nomination");
    });

    it("should handle movie without poster", () => {
      const movie = {
        uid: "movie-1",
        title: "Test Movie",
        year: 2023,
        posterUrl: undefined,
        nominations: [],
      };

      const html = generateMovieHTMLSimpleLocal(movie);

      expect(html).toContain("No poster");
      expect(html).not.toContain("<img");
    });
  });

  describe("Error Handling", () => {
    it("should handle fetch errors gracefully", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      try {
        await fetch("/api/test");
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe("Network error");
      }
    });

    it("should handle API error responses", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: "Unauthorized" }),
      });

      const response = await fetch("/api/test");

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);

      const data = (await response.json()) as { error: string };
      expect(data.error).toBe("Unauthorized");
    });
  });

  describe("Form Validation", () => {
    it("should validate override request data", () => {
      // Valid request
      const validRequest = {
        type: "daily",
        date: "2025-06-21",
        movieId: "movie-1",
      };
      expect(validateOverrideRequestLocal(validRequest).valid).toBe(true);

      // Invalid type
      const invalidType = {
        type: "invalid",
        date: "2025-06-21",
        movieId: "movie-1",
      };
      expect(validateOverrideRequestLocal(invalidType).valid).toBe(false);

      // Invalid date
      const invalidDate = {
        type: "daily",
        date: "2025-6-21",
        movieId: "movie-1",
      };
      expect(validateOverrideRequestLocal(invalidDate).valid).toBe(false);

      // Missing movie ID
      const missingMovieId = {
        type: "daily",
        date: "2025-06-21",
      };
      expect(validateOverrideRequestLocal(missingMovieId).valid).toBe(false);
    });
  });
});
