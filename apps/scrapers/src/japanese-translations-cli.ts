/**
 * 日本語翻訳スクレイピングのCLIエントリーポイント
 */
import {Command, InvalidArgumentError} from 'commander';
import {getDatabase} from '@shine/database';
import {
  getMoviesWithoutJapaneseTranslation,
  saveJapaneseTranslation,
} from './japanese-translations/repository';
import {fetchJapaneseTitleFromTMDB} from './japanese-translations/scrapers/tmdb-scraper';
import {scrapeJapaneseTitleFromWikipedia} from './japanese-translations/scrapers/wikipedia-scraper';
import {
  assertDatabaseEnvironment,
  buildEnvironment,
  loadEnvironmentFiles,
} from './common/environment';

loadEnvironmentFiles();
const environment = buildEnvironment(process.env);

// 処理するバッチサイズ（デフォルト）
const DEFAULT_BATCH_SIZE = 20;

function parseLimit(value: string): number {
  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new InvalidArgumentError(
      '無効なバッチサイズです。正の整数を指定してください。',
    );
  }

  return parsed;
}

/**
 * 日本語翻訳スクレイピングのメイン処理
 */
async function main(options: {
  limit?: number;
  all: boolean;
  shouldIncludeNonJapanese: boolean;
}): Promise<void> {
  const {all: isAllMode, shouldIncludeNonJapanese} = options;

  let batchSize = options.limit ?? DEFAULT_BATCH_SIZE;

  if (isAllMode) {
    batchSize = 0; // 全件処理
    console.log('日本語翻訳スクレイピングを開始します (全件処理モード)');
  } else {
    console.log(
      `日本語翻訳スクレイピングを開始します (バッチサイズ: ${batchSize})`,
    );
  }

  // 環境変数の確認
  assertDatabaseEnvironment(environment);

  // データベース接続
  const database = getDatabase(environment);

  // 日本語翻訳が未登録の映画データを取得
  console.log(
    shouldIncludeNonJapanese
      ? '日本語翻訳が未登録、または原題のまま保存されている映画を検索中...'
      : '日本語翻訳が未登録の映画を検索中...',
  );
  const movies = await getMoviesWithoutJapaneseTranslation(
    database,
    batchSize,
    shouldIncludeNonJapanese,
  );

  if (movies.length === 0) {
    console.log('日本語翻訳が必要な映画が見つかりませんでした。');
    return;
  }

  console.log(
    `${movies.length}件の映画が見つかりました。スクレイピングを開始します。`,
  );
  console.log('─'.repeat(80));

  let successCount = 0;
  let notFoundCount = 0;
  let errorCount = 0;

  // 各映画に対して処理を実行
  for (let index = 0; index < movies.length; index++) {
    const movie = movies[index];
    const progress = `[${index + 1}/${movies.length}]`;

    try {
      console.log(
        `${progress} 処理中: ${movie.englishTitle} (${
          movie.year || '年不明'
        }) - IMDb: ${movie.imdbId}`,
      );

      // TMDBから日本語タイトルを取得
      let japaneseTitle = await fetchJapaneseTitleFromTMDB(
        movie.imdbId,
        movie.tmdbId,
        environment,
      );

      // TMDBで見つからなかった場合はWikipediaで検索（フォールバック）
      if (!japaneseTitle) {
        console.log('  TMDBで見つからなかったため、Wikipediaで検索中...');
        japaneseTitle = await scrapeJapaneseTitleFromWikipedia(movie.imdbId);
      }

      if (japaneseTitle) {
        // 日本語翻訳をデータベースに保存
        await saveJapaneseTranslation(database, {
          resourceType: 'movie_title',
          resourceUid: movie.uid,
          languageCode: 'ja',
          content: japaneseTitle,
        });

        console.log(
          `✅ ${progress} 成功: ${movie.englishTitle} → ${japaneseTitle}`,
        );
        successCount++;
      } else {
        console.log(`❌ ${progress} 見つからず: ${movie.englishTitle}`);
        notFoundCount++;
      }
    } catch (error) {
      console.error(
        `💥 ${progress} エラー: ${movie.englishTitle} - ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      errorCount++;
    }

    // 連続リクエストを避けるための待機（最後の処理以外）
    if (index < movies.length - 1) {
      await new Promise(resolve => {
        setTimeout(resolve, 1000);
      });
    }
  }

  // 結果の表示
  console.log('─'.repeat(80));
  console.log('スクレイピング完了');
  console.log(`✅ 成功: ${successCount}件`);
  console.log(`❌ 見つからず: ${notFoundCount}件`);
  console.log(`💥 エラー: ${errorCount}件`);
  console.log(`📊 合計: ${movies.length}件`);

  if (successCount > 0) {
    console.log(
      `\n${successCount}件の日本語翻訳をデータベースに保存しました。`,
    );
  }
}

const program = new Command();

program
  .name('japanese-translations-cli')
  .description(
    '日本語翻訳が未登録の映画にTMDB/Wikipediaから日本語タイトルを取得して保存します',
  )
  .option(
    '--limit <number>',
    '処理する映画の件数を指定 (デフォルト: 20)',
    parseLimit,
  )
  .option(
    '--all',
    '全件処理モード（日本語翻訳がないすべての映画を処理）',
    false,
  )
  .option(
    '--include-non-japanese',
    '原題がそのまま ja として保存されている映画も取得し直す',
    false,
  )
  .addHelpText(
    'after',
    `
例:
  pnpm run scrape:japanese-translations
  pnpm run scrape:japanese-translations --limit 50
  pnpm run scrape:japanese-translations --all
`,
  )
  .action(main);

try {
  await program.parseAsync(process.argv);
} catch (error) {
  console.error('スクレイピング処理中にエラーが発生しました:', error);
  process.exitCode = 1;
}
