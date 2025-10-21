import {createClient} from '@libsql/client';
import dotenv from 'dotenv';

dotenv.config({path: '../.env'});

const TMDB_API_BASE_URL = 'https://api.themoviedb.org/3';

const environment = {
  NODE_ENV: 'development',
  TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL_DEV,
  TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN_DEV,
  TMDB_API_KEY: process.env.TMDB_API_KEY,
};

if (!environment.TMDB_API_KEY) {
  console.error('TMDB_API_KEY is not set in environment variables');
  process.exit(1);
}

if (!environment.TURSO_DATABASE_URL || !environment.TURSO_AUTH_TOKEN) {
  console.error(
    'Turso database credentials are not set in environment variables'
  );
  process.exit(1);
}

const client = createClient({
  url: environment.TURSO_DATABASE_URL,
  authToken: environment.TURSO_AUTH_TOKEN,
});

async function getMoviesWithImdbId(limit = null) {
  // ポスターがない映画を優先して取得
  let sql = `SELECT m.uid, m.imdb_id as imdbId 
             FROM movies m 
             LEFT JOIN poster_urls p ON m.uid = p.movie_uid 
             WHERE m.imdb_id IS NOT NULL AND p.uid IS NULL`;

  let args = [];
  if (limit) {
    sql += ' LIMIT ?';
    args = [limit];
  }

  const result = await client.execute({sql, args});

  if (result.rows.length > 0) {
    return result.rows.map(row => ({uid: row.uid, imdbId: row.imdbId}));
  }

  // ポスターがない映画がない場合は、すべての映画を取得（重複を避けるため実際には実行されない）
  let allSql =
    'SELECT uid, imdb_id as imdbId FROM movies WHERE imdb_id IS NOT NULL';
  let allArgs = [];
  if (limit) {
    allSql += ' LIMIT ?';
    allArgs = [limit];
  }

  const allResult = await client.execute({sql: allSql, args: allArgs});
  return allResult.rows.map(row => ({uid: row.uid, imdbId: row.imdbId}));
}

async function fetchMovieImages(imdbId) {
  try {
    const findUrl = new URL(`${TMDB_API_BASE_URL}/find/${imdbId}`);
    findUrl.searchParams.append('api_key', environment.TMDB_API_KEY);
    findUrl.searchParams.append('external_source', 'imdb_id');

    const findResponse = await fetch(findUrl.toString());
    if (!findResponse.ok) {
      throw new Error(`TMDb API error: ${findResponse.statusText}`);
    }

    const findData = await findResponse.json();
    const movieResults = findData.movie_results;

    if (!movieResults || movieResults.length === 0) {
      console.log(`No TMDb match found for IMDb ID: ${imdbId}`);
      return undefined;
    }

    const tmdbId = movieResults[0].id;

    const imagesUrl = new URL(`${TMDB_API_BASE_URL}/movie/${tmdbId}/images`);
    imagesUrl.searchParams.append('api_key', environment.TMDB_API_KEY);

    const imagesResponse = await fetch(imagesUrl.toString());
    if (!imagesResponse.ok) {
      throw new Error(`TMDb API error: ${imagesResponse.statusText}`);
    }

    return await imagesResponse.json();
  } catch (error) {
    console.error(`Error fetching TMDb images for IMDb ID ${imdbId}:`, error);
    return undefined;
  }
}

async function savePosterUrls(movieUid, posters) {
  if (!posters || posters.length === 0) {
    return 0;
  }

  const existingResult = await client.execute({
    sql: 'SELECT url FROM poster_urls WHERE movie_uid = ?',
    args: [movieUid],
  });

  const existingUrls = new Set(existingResult.rows.map(row => row.url));
  let savedCount = 0;

  for (const poster of posters) {
    const url = `https://image.tmdb.org/t/p/original${poster.file_path}`;

    if (existingUrls.has(url)) {
      continue;
    }

    await client.execute({
      sql: `INSERT INTO poster_urls (uid, movie_uid, url, width, height, language_code, source_type, is_primary, created_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      args: [
        crypto.randomUUID(),
        movieUid,
        url,
        poster.width,
        poster.height,
        poster.iso_639_1 || null,
        'tmdb',
        savedCount === 0 ? 1 : 0,
      ],
    });

    savedCount++;
  }

  return savedCount;
}

async function main() {
  try {
    console.log('Starting poster URL scraper...');

    const args = process.argv.slice(2);
    const countArg = args.find(arg => arg.startsWith('--count='));
    const allArg = args.includes('--all');

    let count;
    let message;

    if (allArg) {
      count = null; // 制限なし
      message = 'ポスターURL取得を開始します (全件処理)';
    } else {
      count = countArg ? Number.parseInt(countArg.split('=')[1], 10) : 10;
      message = `ポスターURL取得を開始します (処理件数: ${count}件)`;
    }

    console.log(message);

    const moviesWithImdbId = await getMoviesWithImdbId(count);
    if (moviesWithImdbId.length === 0) {
      console.log(
        'ポスターが必要な映画が見つかりませんでした。すべての映画にポスターが設定済みです。'
      );
      return;
    }

    console.log(`処理対象の映画: ${moviesWithImdbId.length}件`);

    let processed = 0;
    let success = 0;
    let failed = 0;
    let totalPosters = 0;

    for (const movie of moviesWithImdbId) {
      console.log(
        `[${processed + 1}/${moviesWithImdbId.length}] 処理開始: IMDb ID ${
          movie.imdbId
        }`
      );
      processed++;

      try {
        console.log('  TMDb API からポスター情報を取得中...');
        const imagesData = await fetchMovieImages(movie.imdbId);

        if (
          !imagesData ||
          !imagesData.posters ||
          imagesData.posters.length === 0
        ) {
          failed++;
          console.log('  ✘ ポスターが見つかりませんでした');
        } else {
          console.log(
            `  ポスター候補: ${imagesData.posters.length}枚見つかりました`
          );
          console.log('  データベースに保存中...');
          const savedCount = await savePosterUrls(
            movie.uid,
            imagesData.posters
          );
          totalPosters += savedCount;

          if (savedCount > 0) {
            success++;
            console.log(`  ✓ ${savedCount}枚のポスターを保存しました`);
          } else {
            failed++;
            console.log('  ✘ 新しいポスターはありませんでした');
          }
        }
      } catch (error) {
        failed++;
        console.log(`  ✘ エラーが発生しました: ${error.message}`);
      }

      console.log(`[${processed}/${moviesWithImdbId.length}] 処理完了`);
      console.log(
        `進捗状況: 成功=${success}, 失敗=${failed}, 合計=${processed}/${moviesWithImdbId.length}`
      );

      // 進捗率の表示
      const progressPercent = (
        (processed / moviesWithImdbId.length) *
        100
      ).toFixed(1);
      console.log(
        `進捗: ${progressPercent}% (残り: ${
          moviesWithImdbId.length - processed
        }件)`
      );
      console.log('------------------------------');

      // APIレート制限を考慮して少し待機（TMDBは40リクエスト/10秒の制限）
      await new Promise(resolve => {
        setTimeout(resolve, 300);
      });
    }

    console.log('\n=== 最終結果 ===');
    console.log(`処理件数: ${processed}`);
    console.log(`成功: ${success}`);
    console.log(`失敗: ${failed}`);
    console.log(`保存されたポスター総数: ${totalPosters}枚`);
  } catch (error) {
    console.error('エラーが発生しました:', error);
    process.exit(1);
  }
}

await main();
