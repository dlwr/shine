import { beforeEach, describe, expect, test, vi } from "vitest";

describe("Movie Search API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("should search movies by query", async () => {
    const searchParameters = new URLSearchParams({
      q: "Test Movie",
      page: "1",
      limit: "10",
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          movies: [
            {
              uid: "test-1",
              title: "Test Movie",
              year: 2023,
              originalLanguage: "en",
              hasAwards: false,
            },
          ],
          pagination: {
            currentPage: 1,
            totalPages: 1,
            totalCount: 1,
            hasNextPage: false,
            hasPrevPage: false,
          },
          filters: {
            query: "Test Movie",
          },
        }),
    });

    vi.stubGlobal("fetch", mockFetch);

    const response = await fetch(
      `http://localhost:8787/movies/search?${searchParameters}`
    );
    const data = (await response.json()) as {
      movies: {
        uid: string;
        title: string;
        year: number;
        originalLanguage: string;
        hasAwards: boolean;
      }[];
      pagination: {
        currentPage: number;
        totalPages: number;
        totalCount: number;
        hasNextPage: boolean;
        hasPrevPage: boolean;
      };
    };

    expect(response.ok).toBe(true);
    expect(data.movies).toHaveLength(1);
    expect(data.movies[0].title).toBe("Test Movie");
    expect(data.pagination.totalCount).toBe(1);
  });

  test("should filter movies by year", async () => {
    const searchParameters = new URLSearchParams({
      year: "2023",
      page: "1",
      limit: "10",
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          movies: [
            {
              uid: "test-1",
              title: "Movie 2023",
              year: 2023,
              originalLanguage: "en",
              hasAwards: false,
            },
          ],
          pagination: {
            currentPage: 1,
            totalPages: 1,
            totalCount: 1,
            hasNextPage: false,
            hasPrevPage: false,
          },
          filters: {
            year: 2023,
          },
        }),
    });

    vi.stubGlobal("fetch", mockFetch);

    const response = await fetch(
      `http://localhost:8787/movies/search?${searchParameters}`
    );
    const data = (await response.json()) as {
      movies: {
        uid: string;
        title: string;
        year: number;
        originalLanguage: string;
        hasAwards: boolean;
      }[];
      filters: { year: number };
    };

    expect(response.ok).toBe(true);
    expect(data.movies[0].year).toBe(2023);
    expect(data.filters.year).toBe(2023);
  });

  test("should filter movies by language", async () => {
    const searchParameters = new URLSearchParams({
      language: "ja",
      page: "1",
      limit: "10",
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          movies: [
            {
              uid: "test-1",
              title: "Japanese Movie",
              year: 2023,
              originalLanguage: "ja",
              hasAwards: false,
            },
          ],
          pagination: {
            currentPage: 1,
            totalPages: 1,
            totalCount: 1,
            hasNextPage: false,
            hasPrevPage: false,
          },
          filters: {
            language: "ja",
          },
        }),
    });

    vi.stubGlobal("fetch", mockFetch);

    const response = await fetch(
      `http://localhost:8787/movies/search?${searchParameters}`
    );
    const data = (await response.json()) as {
      movies: {
        uid: string;
        title: string;
        year: number;
        originalLanguage: string;
        hasAwards: boolean;
      }[];
      filters: { language: string };
    };

    expect(response.ok).toBe(true);
    expect(data.movies[0].originalLanguage).toBe("ja");
    expect(data.filters.language).toBe("ja");
  });

  test("should filter movies by awards status", async () => {
    const searchParameters = new URLSearchParams({
      hasAwards: "true",
      page: "1",
      limit: "10",
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          movies: [
            {
              uid: "test-1",
              title: "Award Winner",
              year: 2023,
              originalLanguage: "en",
              hasAwards: true,
            },
          ],
          pagination: {
            currentPage: 1,
            totalPages: 1,
            totalCount: 1,
            hasNextPage: false,
            hasPrevPage: false,
          },
          filters: {
            hasAwards: true,
          },
        }),
    });

    vi.stubGlobal("fetch", mockFetch);

    const response = await fetch(
      `http://localhost:8787/movies/search?${searchParameters}`
    );
    const data = (await response.json()) as {
      movies: {
        uid: string;
        title: string;
        year: number;
        originalLanguage: string;
        hasAwards: boolean;
      }[];
      filters: { hasAwards: boolean };
    };

    expect(response.ok).toBe(true);
    expect(data.movies[0].hasAwards).toBe(true);
    expect(data.filters.hasAwards).toBe(true);
  });

  test("should handle pagination correctly", async () => {
    const searchParameters = new URLSearchParams({
      page: "2",
      limit: "5",
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          movies: [],
          pagination: {
            currentPage: 2,
            totalPages: 3,
            totalCount: 15,
            hasNextPage: true,
            hasPrevPage: true,
          },
          filters: {},
        }),
    });

    vi.stubGlobal("fetch", mockFetch);

    const response = await fetch(
      `http://localhost:8787/movies/search?${searchParameters}`
    );
    const data = (await response.json()) as {
      pagination: {
        currentPage: number;
        totalPages: number;
        hasNextPage: boolean;
        hasPrevPage: boolean;
      };
    };

    expect(response.ok).toBe(true);
    expect(data.pagination.currentPage).toBe(2);
    expect(data.pagination.totalPages).toBe(3);
    expect(data.pagination.hasNextPage).toBe(true);
    expect(data.pagination.hasPrevPage).toBe(true);
  });

  test("should return empty results for no matches", async () => {
    const searchParameters = new URLSearchParams({
      q: "NonexistentMovie",
      page: "1",
      limit: "10",
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          movies: [],
          pagination: {
            currentPage: 1,
            totalPages: 0,
            totalCount: 0,
            hasNextPage: false,
            hasPrevPage: false,
          },
          filters: {
            query: "NonexistentMovie",
          },
        }),
    });

    vi.stubGlobal("fetch", mockFetch);

    const response = await fetch(
      `http://localhost:8787/movies/search?${searchParameters}`
    );
    const data = (await response.json()) as {
      movies: unknown[];
      pagination: { totalCount: number };
    };

    expect(response.ok).toBe(true);
    expect(data.movies).toHaveLength(0);
    expect(data.pagination.totalCount).toBe(0);
  });

  test("should validate limit parameter", async () => {
    const searchParameters = new URLSearchParams({
      limit: "150", // Above max limit of 100
      page: "1",
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          movies: [],
          pagination: {
            currentPage: 1,
            totalPages: 0,
            totalCount: 0,
            hasNextPage: false,
            hasPrevPage: false,
          },
          filters: {},
        }),
    });

    vi.stubGlobal("fetch", mockFetch);

    const response = await fetch(
      `http://localhost:8787/movies/search?${searchParameters}`
    );

    expect(response.ok).toBe(true);
  });

  test("should handle invalid year filter", async () => {
    const searchParameters = new URLSearchParams({
      year: "invalid-year",
      page: "1",
      limit: "10",
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          movies: [],
          pagination: {
            currentPage: 1,
            totalPages: 0,
            totalCount: 0,
            hasNextPage: false,
            hasPrevPage: false,
          },
          filters: {},
        }),
    });

    vi.stubGlobal("fetch", mockFetch);

    const response = await fetch(
      `http://localhost:8787/movies/search?${searchParameters}`
    );
    const data = (await response.json()) as {
      filters: { year?: number };
    };

    expect(response.ok).toBe(true);
    expect(data.filters.year).toBeUndefined();
  });
});
