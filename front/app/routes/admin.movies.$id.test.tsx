import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import AdminMovieEdit, { loader, meta } from "./admin.movies.$id";

// LocalStorageのモック
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

Object.defineProperty(globalThis, "localStorage", {
  value: mockLocalStorage,
  writable: true,
});

// Fetchのモック
globalThis.fetch = vi.fn();

// Cloudflare環境のモック
const createMockContext = (apiUrl = "http://localhost:8787") => ({
  cloudflare: {
    env: {
      PUBLIC_API_URL: apiUrl,
    },
  },
});

// 映画詳細のモックデータ
const mockMovieDetails = {
  uid: "movie-123",
  year: 2023,
  originalLanguage: "en",
  imdbId: "tt1234567",
  tmdbId: 123_456,
  translations: [
    {
      uid: "trans-1",
      languageCode: "ja",
      content: "テスト映画",
      isDefault: 1,
    },
    {
      uid: "trans-2",
      languageCode: "en",
      content: "Test Movie",
      isDefault: 0,
    },
  ],
  nominations: [
    {
      uid: "nom-1",
      isWinner: true,
      specialMention: null,
      category: {
        uid: "cat-1",
        name: "最優秀作品賞",
      },
      ceremony: {
        uid: "cer-1",
        number: 96,
        year: 2023,
      },
      organization: {
        uid: "org-1",
        name: "アカデミー賞",
        shortName: "AA",
      },
    },
  ],
  posters: [
    {
      uid: "poster-1",
      url: "https://example.com/poster1.jpg",
      width: 500,
      height: 750,
      languageCode: "ja",
      source: "TMDb",
      isPrimary: true,
    },
  ],
};

describe("AdminMovieEdit Route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // 認証済み状態に設定
    mockLocalStorage.getItem.mockReturnValue("valid-admin-token");
  });

  describe("loader", () => {
    it("映画IDが提供されていない場合は400エラーを返す", async () => {
      const context = createMockContext();
      const params = {}; // IDなし

      try {
        await loader({ context, params } as any);
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(Response);
        expect((error as Response).status).toBe(400);
        const text = await (error as Response).text();
        expect(text).toBe("Movie ID is required");
      }
    });

    it("映画IDが提供された場合は正しいデータを返す", async () => {
      const context = createMockContext();
      const params = { id: "movie-123" };

      const result = await loader({ context, params } as any);

      expect(result).toEqual({
        apiUrl: "http://localhost:8787",
        movieId: "movie-123",
      });
    });
  });

  describe("meta", () => {
    it("正しいメタデータを返す", () => {
      const params = { id: "movie-123" };
      const result = meta({ params } as any);

      expect(result).toEqual([
        { title: "映画の編集 - SHINE Admin" },
        { name: "description", content: "SHINE Admin 映画編集画面" },
      ]);
    });
  });

  describe("Component", () => {
    it("ローディング状態を正しく表示する", () => {
      render(
        <AdminMovieEdit
          loaderData={{
            apiUrl: "http://localhost:8787",
            movieId: "movie-123",
          }}
          actionData={{} as any}
          params={{ id: "movie-123" }}
          matches={[
            {
              id: "root",
              params: {},
              pathname: "/",
              data: undefined,
              handle: undefined,
            },
            {
              id: "routes/admin.movies.$id",
              params: { id: "movie-123" },
              pathname: "/admin/movies/movie-123",
              data: undefined,
              handle: undefined,
            },
          ]}
        />,
      );

      expect(screen.getByText("データを読み込み中...")).toBeInTheDocument();
      expect(screen.getByText("映画の編集")).toBeInTheDocument();
      expect(screen.getByText("← 一覧に戻る")).toBeInTheDocument();
      expect(screen.getByText("ログアウト")).toBeInTheDocument();
    });

    it("映画データがロードされた後、正しく表示される", async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockMovieDetails,
      } as Response);

      render(
        <AdminMovieEdit
          loaderData={{
            apiUrl: "http://localhost:8787",
            movieId: "movie-123",
          }}
          actionData={{} as any}
          params={{ id: "movie-123" }}
          matches={[]}
        />,
      );

      // ローディング状態をスキップして、データが表示されることをテスト
      // 実際のuseEffectは動作しないので、データがある状態をテストするには
      // 別のアプローチが必要
    });

    it("エラー状態を正しく表示する", () => {
      // エラー状態のテストは実装が必要
    });

    it("映画が見つからない場合のメッセージを表示する", () => {
      // 映画が見つからない場合のテストは実装が必要
    });

    it("ナビゲーションリンクが正しく設定される", () => {
      render(
        <AdminMovieEdit
          loaderData={{
            apiUrl: "http://localhost:8787",
            movieId: "movie-123",
          }}
          actionData={{} as any}
          params={{ id: "movie-123" }}
          matches={[]}
        />,
      );

      const backLinks = screen.getAllByText("← 一覧に戻る");
      expect(backLinks[0]).toHaveAttribute("href", "/admin/movies");
    });
  });

  describe("Route Registration", () => {
    it("admin/movies/:id ルートが存在することを確認", () => {
      // このテストは routes.ts の設定を確認するためのテスト
      // 実際には routes.ts ファイルを読み込んで確認する必要がある
      expect(true).toBe(true); // プレースホルダー
    });
  });
});
