/**
 * 既存の映画データに対する日本語翻訳データをスクレイピングするモジュール
 */
import {getDatabase, type Environment} from '../../../src/index';
import {
  getMoviesWithoutJapaneseTranslation,
  saveJapaneseTranslationsBatch,
} from './repository';
import {fetchJapaneseTitleFromTMDB} from './scrapers/tmdb-scraper';

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
      path === '/japanese-translations' ||
      path === '/japanese-translations/'
    ) {
      return this.handleBatchScraping(environment);
    }

    // 単一映画のスクレイピング
    if (path.startsWith('/japanese-translations/movie/')) {
      const movieId = path.split('/').pop();
      if (!movieId) {
        return new Response('Movie ID is required', {status: 400});
      }

      return this.handleSingleMovieScraping(movieId);
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
        headers: {'Content-Type': 'text/plain'},
      },
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
      const database = getDatabase(environment);
      const movies = await getMoviesWithoutJapaneseTranslation(
        database,
        BATCH_SIZE,
      );

      if (movies.length === 0) {
        return new Response('No movies found without Japanese translation', {
          status: 200,
        });
      }

      console.log(`Found ${movies.length} movies without Japanese translation`);

      const results = [];
      let successCount = 0;

      // バッチ処理用の配列
      const translationsBatch: Array<{
        resourceType: string;
        resourceUid: string;
        languageCode: string;
        content: string;
        isDefault?: number;
      }> = [];

      // 各映画に対して処理を実行
      for (const movie of movies) {
        try {
          console.log(
            `Processing movie: ${movie.englishTitle} (${movie.imdbId})`,
          );

          // TMDBから日本語タイトルを取得
          const japaneseTitle = await fetchJapaneseTitleFromTMDB(
            movie.imdbId,
            movie.tmdbId,
            environment,
          );

          // TMDBで見つからなかった場合はWikipediaで検索
          // if (!japaneseTitle) {
          //   console.log(`  TMDB not found, trying Wikipedia...`);
          //   japaneseTitle = await scrapeJapaneseTitleFromWikipedia(movie.imdbId);
          // }

          if (japaneseTitle) {
            // バッチに追加
            translationsBatch.push({
              resourceType: 'movie_title',
              resourceUid: movie.uid,
              languageCode: 'ja',
              content: japaneseTitle,
              isDefault: 0,
            });

            successCount++;
            results.push({
              movieId: movie.uid,
              imdbId: movie.imdbId,
              englishTitle: movie.englishTitle,
              japaneseTitle,
              status: 'success',
            });
          } else {
            results.push({
              movieId: movie.uid,
              imdbId: movie.imdbId,
              englishTitle: movie.englishTitle,
              status: 'not_found',
            });
          }
        } catch (error) {
          console.error(`Error processing movie ${movie.uid}:`, error);
          results.push({
            movieId: movie.uid,
            imdbId: movie.imdbId,
            englishTitle: movie.englishTitle,
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
          });
        }

        // 連続リクエストを避けるための待機
        await new Promise(resolve => {
          setTimeout(resolve, 1000);
        });
      }

      // バッチで翻訳データを保存
      if (translationsBatch.length > 0) {
        await saveJapaneseTranslationsBatch(database, translationsBatch);
        console.log(
          `Saved ${translationsBatch.length} Japanese translations in batch`,
        );
      }

      return new Response(
        JSON.stringify({
          total: movies.length,
          success: successCount,
          results,
        }),
        {
          status: 200,
          headers: {'Content-Type': 'application/json'},
        },
      );
    } catch (error) {
      console.error('Batch scraping error:', error);
      return new Response(
        JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
        }),
        {
          status: 500,
          headers: {'Content-Type': 'application/json'},
        },
      );
    }
  },

  /**
   * 単一映画のスクレイピングを処理する
   * @param movieId 映画ID
   * @returns レスポンスオブジェクト
   */
  async handleSingleMovieScraping(movieId: string): Promise<Response> {
    try {
      console.log(`Movie ID: ${movieId}`);
      return new Response('Not implemented yet', {status: 501});
    } catch (error) {
      console.error(`Error scraping movie ${movieId}:`, error);
      return new Response(
        JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
        }),
        {
          status: 500,
          headers: {'Content-Type': 'application/json'},
        },
      );
    }
  },
};
