import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import MovieDetail, { loader, meta } from "./movies.$id";

// Cloudflare環境のモック
const createMockContext = (apiUrl = "http://localhost:8787") => ({
  cloudflare: {
    env: {
      PUBLIC_API_URL: apiUrl,
    },
  },
});

// 映画詳細データのモック
const mockMovieDetail = {
  movieUid: "movie-123",
  movie: {
    imdbId: "tt1234567",
    tmdbId: 123_456,
    year: 2023,
    duration: 145,
    createdAt: "2023-01-01T00:00:00Z",
    updatedAt: "2023-01-01T00:00:00Z",
  },
  translations: [
    {
      languageCode: "ja",
      resourceType: "movie_title",
      content: "パルム・ドール受賞作品",
    },
    {
      languageCode: "en",
      resourceType: "movie_title",
      content: "Palme d'Or Winner",
    },
  ],
  posterUrls: [
    {
      posterUid: "poster-1",
      url: "https://example.com/poster-large.jpg",
      width: 500,
      height: 750,
      isPrimary: true,
      languageCode: "ja",
      source: "tmdb",
    },
  ],
  nominations: [
    {
      nominationUid: "nom-1",
      isWinner: true,
      category: {
        categoryUid: "cat-1",
        name: "Palme d'Or",
      },
      ceremony: {
        ceremonyUid: "cer-1",
        name: "Cannes Film Festival",
        year: 2023,
      },
    },
    {
      nominationUid: "nom-2",
      isWinner: false,
      category: {
        categoryUid: "cat-2",
        name: "Best Picture",
      },
      ceremony: {
        ceremonyUid: "cer-2",
        name: "Academy Awards",
        year: 2024,
      },
    },
  ],
};

// Fetchのモック
globalThis.fetch = vi.fn();

describe("MovieDetail Component", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("loader", () => {
    it("指定されたIDの映画詳細データを正常に取得する", async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockMovieDetail,
      } as Response);

      const context = createMockContext();
      const parameters = { id: "movie-123" };
      const request = { signal: undefined } as Request;
      const result = await loader({
        context,
        request,
        params: parameters,
        matches: [
          {
            id: "root",
            params: {},
            pathname: "/",
            data: undefined,
            handle: undefined,
          },
          {
            id: "routes/movies.$id",
            params: { id: "movie-123" },
            pathname: "/movies/movie-123",
            data: undefined,
            handle: undefined,
          },
        ],
      } as any);

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8787/movies/movie-123",
        {
          signal: undefined,
        },
      );
      expect(result).toEqual({
        movieDetail: mockMovieDetail,
      });
    });

    it("存在しない映画IDの場合は404エラーを返す", async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      } as Response);

      const context = createMockContext();
      const parameters = { id: "non-existent" };
      const request = { signal: undefined } as Request;
      const result = await loader({
        context,
        request,
        params: parameters,
        matches: [
          {
            id: "root",
            params: {},
            pathname: "/",
            data: undefined,
            handle: undefined,
          },
          {
            id: "routes/movies.$id",
            params: { id: "non-existent" },
            pathname: "/movies/non-existent",
            data: undefined,
            handle: undefined,
          },
        ],
      } as any);

      expect(result).toEqual({
        error: "映画が見つかりませんでした",
        status: 404,
      });
    });

    it("API接続エラーの場合はエラー情報を返す", async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const context = createMockContext();
      const parameters = { id: "movie-123" };
      const request = { signal: undefined } as Request;
      const result = await loader({
        context,
        request,
        params: parameters,
        matches: [
          {
            id: "root",
            params: {},
            pathname: "/",
            data: undefined,
            handle: undefined,
          },
          {
            id: "routes/movies.$id",
            params: { id: "movie-123" },
            pathname: "/movies/movie-123",
            data: undefined,
            handle: undefined,
          },
        ],
      } as any);

      expect(result).toEqual({
        error: "APIへの接続に失敗しました",
        status: 500,
      });
    });
  });

  describe("meta", () => {
    it("映画データが正常な場合は映画タイトルを含むメタデータを返す", () => {
      const loaderData = {
        movieDetail: mockMovieDetail,
      };

      const result = meta({
        data: loaderData,
        location: {
          pathname: "/movies/movie-123",
          search: "",
          hash: "",
          state: undefined,
          key: "",
        },
        params: { id: "movie-123" },
        matches: [
          {
            id: "root",
            params: {},
            pathname: "/",
            data: undefined,
            handle: undefined,
          },
          {
            id: "routes/movies.$id",
            params: { id: "movie-123" },
            pathname: "/movies/movie-123",
            data: undefined,
            handle: undefined,
          },
        ],
      } as any);

      expect(result).toEqual([
        { title: "パルム・ドール受賞作品 (2023) | SHINE" },
        {
          name: "description",
          content:
            "パルム・ドール受賞作品 (2023年) の詳細情報。受賞歴、ポスター、その他の情報をご覧いただけます。",
        },
      ]);
    });

    it("エラー状態の場合はデフォルトメタデータを返す", () => {
      const loaderData = {
        error: "映画が見つかりませんでした",
        status: 404,
      };

      const result = meta({
        data: loaderData,
        location: {
          pathname: "/movies/movie-123",
          search: "",
          hash: "",
          state: undefined,
          key: "",
        },
        params: { id: "movie-123" },
        matches: [
          {
            id: "root",
            params: {},
            pathname: "/",
            data: undefined,
            handle: undefined,
          },
          {
            id: "routes/movies.$id",
            params: { id: "movie-123" },
            pathname: "/movies/movie-123",
            data: undefined,
            handle: undefined,
          },
        ],
      } as any);

      expect(result).toEqual([
        { title: "映画が見つかりません | SHINE" },
        {
          name: "description",
          content: "指定された映画は見つかりませんでした。",
        },
      ]);
    });
  });

  describe("Component", () => {
    it("映画詳細データが正常に表示される", () => {
      const loaderData = {
        movieDetail: mockMovieDetail,
      };

      render(
        <MovieDetail
          loaderData={loaderData as any}
          actionData={undefined}
          params={{ id: "movie-123" }}
          matches={
            [
              {
                id: "root",
                params: {},
                pathname: "/",
                data: undefined,
                handle: undefined,
              },
              {
                id: "routes/movies.$id",
                params: { id: "movie-123" },
                pathname: "/movies/movie-123",
                data: loaderData,
                handle: undefined,
              },
            ] as any
          }
        />,
      );

      // 映画タイトルが表示される
      expect(screen.getByText("パルム・ドール受賞作品")).toBeInTheDocument();

      // 基本情報が表示される
      expect(screen.getByText("2023年")).toBeInTheDocument();
      expect(screen.getByText("145分")).toBeInTheDocument();
      const imdbElements = screen.getAllByText(/IMDb: tt\d+/);
      expect(imdbElements.length).toBeGreaterThanOrEqual(1);
      expect(imdbElements[0]).toHaveTextContent("IMDb: tt1234567");

      // ポスター画像が表示される
      const posterImage = screen.getByAltText("パルム・ドール受賞作品");
      expect(posterImage).toBeInTheDocument();
      expect(posterImage).toHaveAttribute(
        "src",
        "https://example.com/poster-large.jpg",
      );
    });

    it("受賞・ノミネート情報が正しく表示される", () => {
      const loaderData = {
        movieDetail: mockMovieDetail,
      };

      render(
        <MovieDetail
          loaderData={loaderData as any}
          actionData={undefined}
          params={{ id: "movie-123" }}
          matches={
            [
              {
                id: "root",
                params: {},
                pathname: "/",
                data: undefined,
                handle: undefined,
              },
              {
                id: "routes/movies.$id",
                params: { id: "movie-123" },
                pathname: "/movies/movie-123",
                data: loaderData,
                handle: undefined,
              },
            ] as any
          }
        />,
      );

      // 受賞情報
      const winningElements = screen.getAllByText(/🏆.*受賞/);
      expect(winningElements.length).toBeGreaterThanOrEqual(1);
      expect(winningElements[0]).toHaveTextContent(
        "🏆 Cannes Film Festival 2023 受賞",
      );

      // ノミネート情報
      const nominationElements = screen.getAllByText(/🎬.*ノミネート/);
      expect(nominationElements.length).toBeGreaterThanOrEqual(1);
      expect(nominationElements[0]).toHaveTextContent(
        "🎬 Academy Awards 2024 ノミネート",
      );
    });

    it("404エラー状態が正常に表示される", () => {
      const loaderData = {
        error: "映画が見つかりませんでした",
        status: 404,
      };

      render(
        <MovieDetail
          loaderData={loaderData as any}
          actionData={undefined}
          params={{ id: "movie-123" }}
          matches={
            [
              {
                id: "root",
                params: {},
                pathname: "/",
                data: undefined,
                handle: undefined,
              },
              {
                id: "routes/movies.$id",
                params: { id: "movie-123" },
                pathname: "/movies/movie-123",
                data: loaderData,
                handle: undefined,
              },
            ] as any
          }
        />,
      );

      expect(screen.getByText("映画が見つかりません")).toBeInTheDocument();
      expect(
        screen.getByText("映画が見つかりませんでした"),
      ).toBeInTheDocument();
    });

    it("サーバーエラー状態が正常に表示される", () => {
      const loaderData = {
        error: "APIへの接続に失敗しました",
        status: 500,
      };

      render(
        <MovieDetail
          loaderData={loaderData as any}
          actionData={undefined}
          params={{ id: "movie-123" }}
          matches={
            [
              {
                id: "root",
                params: {},
                pathname: "/",
                data: undefined,
                handle: undefined,
              },
              {
                id: "routes/movies.$id",
                params: { id: "movie-123" },
                pathname: "/movies/movie-123",
                data: loaderData,
                handle: undefined,
              },
            ] as any
          }
        />,
      );

      expect(screen.getByText("エラーが発生しました")).toBeInTheDocument();
      expect(screen.getByText("APIへの接続に失敗しました")).toBeInTheDocument();
    });

    it("ホームページへの戻るリンクが表示される", () => {
      const loaderData = {
        movieDetail: mockMovieDetail,
      };

      render(
        <MovieDetail
          loaderData={loaderData as any}
          actionData={undefined}
          params={{ id: "movie-123" }}
          matches={
            [
              {
                id: "root",
                params: {},
                pathname: "/",
                data: undefined,
                handle: undefined,
              },
              {
                id: "routes/movies.$id",
                params: { id: "movie-123" },
                pathname: "/movies/movie-123",
                data: loaderData,
                handle: undefined,
              },
            ] as any
          }
        />,
      );

      const backLinks = screen.getAllByRole("link", { name: /ホームに戻る/ });
      expect(backLinks.length).toBeGreaterThanOrEqual(1);
      expect(backLinks[0]).toBeInTheDocument();
      expect(backLinks[0]).toHaveAttribute("href", "/");
    });
  });
});
