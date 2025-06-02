/**
 * 日本語翻訳スクレイピングのCLIエントリーポイント
 */
import { config } from "dotenv";
import { getDatabase, type Environment } from "../../src";
import {
  getMoviesWithoutJapaneseTranslation,
  saveJapaneseTranslation,
} from "./japanese-translations/repository";
import { scrapeJapaneseTitleFromWikipedia } from "./japanese-translations/scrapers/wikipedia-scraper";

// 環境変数を読み込み
config();

// 処理するバッチサイズ（デフォルト）
const DEFAULT_BATCH_SIZE = 20;

// 環境変数から設定を取得
const environment: Environment = {
  TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL_DEV || "",
  TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN_DEV || "",
};

/**
 * 日本語翻訳スクレイピングのメイン処理
 */
async function main() {
  try {
    // コマンドライン引数を解析
    const args = process.argv.slice(2);
    const limitIndex = args.indexOf("--limit");
    const batchSize = limitIndex !== -1 && args[limitIndex + 1] 
      ? parseInt(args[limitIndex + 1], 10) 
      : DEFAULT_BATCH_SIZE;

    if (isNaN(batchSize) || batchSize <= 0) {
      console.error("無効なバッチサイズです。正の整数を指定してください。");
      process.exit(1);
    }

    console.log(`日本語翻訳スクレイピングを開始します (バッチサイズ: ${batchSize})`);

    // 環境変数の確認
    if (!environment.TURSO_DATABASE_URL || !environment.TURSO_AUTH_TOKEN) {
      console.error("データベース接続情報が不足しています。");
      console.error("TURSO_DATABASE_URL_DEV と TURSO_AUTH_TOKEN_DEV を設定してください。");
      process.exit(1);
    }

    // データベース接続
    const database = getDatabase(environment);

    // 日本語翻訳が未登録の映画データを取得
    console.log("日本語翻訳が未登録の映画を検索中...");
    const movies = await getMoviesWithoutJapaneseTranslation(database, batchSize);

    if (movies.length === 0) {
      console.log("日本語翻訳が必要な映画が見つかりませんでした。");
      return;
    }

    console.log(`${movies.length}件の映画が見つかりました。スクレイピングを開始します。`);
    console.log("─".repeat(80));

    let successCount = 0;
    let notFoundCount = 0;
    let errorCount = 0;

    // 各映画に対して処理を実行
    for (let i = 0; i < movies.length; i++) {
      const movie = movies[i];
      const progress = `[${i + 1}/${movies.length}]`;
      
      try {
        console.log(`${progress} 処理中: ${movie.englishTitle} (${movie.year || "年不明"}) - IMDb: ${movie.imdbId}`);

        // IMDb IDからWikipediaで日本語タイトルを検索
        const japaneseTitle = await scrapeJapaneseTitleFromWikipedia(movie.imdbId);

        if (japaneseTitle) {
          // 日本語翻訳をデータベースに保存
          await saveJapaneseTranslation(database, {
            resourceType: "movie_title",
            resourceUid: movie.uid,
            languageCode: "ja",
            content: japaneseTitle,
          });

          console.log(`✅ ${progress} 成功: ${movie.englishTitle} → ${japaneseTitle}`);
          successCount++;
        } else {
          console.log(`❌ ${progress} 見つからず: ${movie.englishTitle}`);
          notFoundCount++;
        }
      } catch (error) {
        console.error(`💥 ${progress} エラー: ${movie.englishTitle} - ${error instanceof Error ? error.message : String(error)}`);
        errorCount++;
      }

      // 連続リクエストを避けるための待機（最後の処理以外）
      if (i < movies.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    // 結果の表示
    console.log("─".repeat(80));
    console.log("スクレイピング完了");
    console.log(`✅ 成功: ${successCount}件`);
    console.log(`❌ 見つからず: ${notFoundCount}件`);
    console.log(`💥 エラー: ${errorCount}件`);
    console.log(`📊 合計: ${movies.length}件`);

    if (successCount > 0) {
      console.log(`\n${successCount}件の日本語翻訳をデータベースに保存しました。`);
    }

  } catch (error) {
    console.error("スクレイピング処理中にエラーが発生しました:", error);
    process.exit(1);
  }
}

// 使用方法の表示
function showUsage() {
  console.log("使用方法:");
  console.log("  pnpm run scrape:japanese-translations [--limit <数値>]");
  console.log("");
  console.log("オプション:");
  console.log("  --limit <数値>  処理する映画の件数を指定 (デフォルト: 20)");
  console.log("");
  console.log("例:");
  console.log("  pnpm run scrape:japanese-translations");
  console.log("  pnpm run scrape:japanese-translations --limit 50");
}

// ヘルプオプションの処理
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  showUsage();
  process.exit(0);
}

// メイン処理を実行
main().catch((error) => {
  console.error("予期しないエラーが発生しました:", error);
  process.exit(1);
});