/**
 * 既存の映画データに対する日本語翻訳データをスクレイピングするモジュール
 */
import type { Environment } from "db";
import {
  getMoviesWithoutJapaneseTranslation,
  saveJapaneseTranslation,
} from "./repository";
import { scrapeJapaneseTitleFromEigaDotCom } from "./scrapers/eigadotcom-scraper";
import { scrapeJapaneseTitleFromWikipedia } from "./scrapers/wikipedia-scraper";

// 処理するバッチサイズ
const BATCH_SIZE = 20;

/**
 * 日本語翻訳スクレイピングのメインハンドラー
 */
export default {
  /**
   * リクエストを処理する
   * @param request リクエストオブジェクト
   * @param environment 環境変数
   * @returns レスポンスオブジェクト
   */
  async fetch(request: Request, environment: Environment): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.toLowerCase();

    // 一括スクレイピング
    if (
      path === "/japanese-translations" ||
      path === "/japanese-translations/"
    ) {
      return this.handleBatchScraping(environment);
    }

    // 単一映画のスクレイピング
    if (path.startsWith("/japanese-translations/movie/")) {
      const movieId = path.split("/").pop();
      if (!movieId) {
        return new Response("Movie ID is required", { status: 400 });
      }
      return this.handleSingleMovieScraping(movieId, environment);
    }

    // デフォルトレスポンス
    return new Response(
      `
      Available routes:
      - /japanese-translations - Batch scrape Japanese translations for movies
      - /japanese-translations/movie/:movieId - Scrape Japanese translation for a specific movie
    `,
      {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      }
    );
  },

  /**
   * 一括スクレイピングを処理する
   * @param environment 環境変数
   * @returns レスポンスオブジェクト
   */
  async handleBatchScraping(environment: Environment): Promise<Response> {
    try {
      // 日本語翻訳が未登録の映画データを取得
      const movies = await getMoviesWithoutJapaneseTranslation(
        environment.DB,
        BATCH_SIZE
      );

      if (movies.length === 0) {
        return new Response("No movies found without Japanese translation", {
          status: 200,
        });
      }

      console.log(`Found ${movies.length} movies without Japanese translation`);

      const results = [];
      let successCount = 0;

      // 各映画に対して処理を実行
      for (const movie of movies) {
        try {
          // IMDb IDからWikipediaで日本語タイトルを検索
          let japaneseTitle = await scrapeJapaneseTitleFromWikipedia(
            movie.imdbId
          );

          // Wikipediaで見つからなかった場合は映画.comで検索
          if (!japaneseTitle && movie.year) {
            japaneseTitle = await scrapeJapaneseTitleFromEigaDotCom(
              movie.imdbId,
              movie.englishTitle,
              movie.year
            );
          }

          if (japaneseTitle) {
            // 日本語翻訳をデータベースに保存
            await saveJapaneseTranslation(environment.DB, {
              resourceType: "movie_title",
              resourceUid: movie.uid,
              languageCode: "ja",
              content: japaneseTitle,
            });

            successCount++;
            results.push({
              movieId: movie.uid,
              imdbId: movie.imdbId,
              englishTitle: movie.englishTitle,
              japaneseTitle,
              status: "success",
            });
          } else {
            results.push({
              movieId: movie.uid,
              imdbId: movie.imdbId,
              englishTitle: movie.englishTitle,
              status: "not_found",
            });
          }
        } catch (error) {
          console.error(`Error processing movie ${movie.uid}:`, error);
          results.push({
            movieId: movie.uid,
            imdbId: movie.imdbId,
            englishTitle: movie.englishTitle,
            status: "error",
            error: error instanceof Error ? error.message : String(error),
          });
        }

        // 連続リクエストを避けるための待機
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      return new Response(
        JSON.stringify({
          total: movies.length,
          success: successCount,
          results,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    } catch (error) {
      console.error("Batch scraping error:", error);
      return new Response(
        JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  },

  /**
   * 単一映画のスクレイピングを処理する
   * @param movieId 映画ID
   * @param environment 環境変数
   * @returns レスポンスオブジェクト
   */
  async handleSingleMovieScraping(
    movieId: string,
    environment: Environment
  ): Promise<Response> {
    try {
      // TODO: 実装
      return new Response("Not implemented yet", { status: 501 });
    } catch (error) {
      console.error(`Error scraping movie ${movieId}:`, error);
      return new Response(
        JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  },
};
