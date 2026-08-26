import {eq, sql} from 'drizzle-orm';
import {getDatabase, type Environment} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {posterUrls} from '@shine/database/schema/poster-urls';
import {
  fetchTMDBImages,
  fetchTMDBMovieImages,
  savePosterUrls,
  saveTMDBId,
} from './common/tmdb-utilities';

type MovieWithImdbId = {
  uid: string;
  imdbId: string;
  tmdbId: number | undefined;
};

const normalizeMovies = <
  T extends {uid: string; imdbId: unknown; tmdbId: unknown},
>(
  rows: T[],
) =>
  rows.map(movie => ({
    uid: movie.uid,
    imdbId: typeof movie.imdbId === 'string' ? movie.imdbId : undefined,
    tmdbId: typeof movie.tmdbId === 'number' ? movie.tmdbId : undefined,
  }));

const filterMoviesWithImdbId = (
  movies: Array<{
    uid: string;
    imdbId: string | undefined;
    tmdbId: number | undefined;
  }>,
) =>
  movies.filter(
    (movie): movie is MovieWithImdbId =>
      typeof movie.imdbId === 'string' && movie.imdbId.length > 0,
  );

export default {
  async fetch(request: Request, environment: Environment): Promise<Response> {
    const tmdbApiKey = environment.TMDB_API_KEY;

    if (!tmdbApiKey) {
      return new Response('TMDB_API_KEY is not set', {status: 500});
    }

    try {
      const url = new URL(request.url);
      const processCountParameter = url.searchParams.get('count');
      const processCount = processCountParameter
        ? Number(processCountParameter)
        : 10;

      const result = await fetchAndStorePosterUrls(
        environment,
        tmdbApiKey,
        processCount,
      );
      return Response.json(result, {
        status: 200,
        headers: {'Content-Type': 'application/json'},
      });
    } catch (error) {
      console.error('Error processing posters:', error);
      return new Response(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
        {status: 500},
      );
    }
  },
};

async function getMoviesWithImdbId(
  environment: Environment,
  limit = 10,
): Promise<MovieWithImdbId[]> {
  const database = getDatabase(environment);

  // まず、ポスターがない映画を優先的に取得（TMDB IDもない映画を優先）
  const moviesWithoutPosters = await database
    .select({uid: movies.uid, imdbId: movies.imdbId, tmdbId: movies.tmdbId})
    .from(movies)
    .leftJoin(posterUrls, eq(movies.uid, posterUrls.movieUid))
    .where(
      sql`${movies.imdbId} IS NOT NULL AND ${posterUrls.uid} IS NULL AND ${movies.tmdbId} IS NULL AND ${movies.deletedAt} IS NULL`,
    )
    .limit(limit);

  const filteredMoviesWithoutPosters = filterMoviesWithImdbId(
    normalizeMovies(moviesWithoutPosters),
  );

  if (filteredMoviesWithoutPosters.length > 0) {
    return filteredMoviesWithoutPosters;
  }

  // ポスターがない映画（TMDB IDがある映画）
  const moviesWithoutPostersButWithTmdb = await database
    .select({uid: movies.uid, imdbId: movies.imdbId, tmdbId: movies.tmdbId})
    .from(movies)
    .leftJoin(posterUrls, eq(movies.uid, posterUrls.movieUid))
    .where(
      sql`${movies.imdbId} IS NOT NULL AND ${posterUrls.uid} IS NULL AND ${movies.tmdbId} IS NOT NULL AND ${movies.deletedAt} IS NULL`,
    )
    .limit(limit);

  const filteredMoviesWithoutPostersButWithTmdb = filterMoviesWithImdbId(
    normalizeMovies(moviesWithoutPostersButWithTmdb),
  );

  if (filteredMoviesWithoutPostersButWithTmdb.length > 0) {
    return filteredMoviesWithoutPostersButWithTmdb;
  }

  // 最後に、TMDB IDがない映画を取得
  const moviesWithImdbIdNoTmdb = await database
    .select({uid: movies.uid, imdbId: movies.imdbId, tmdbId: movies.tmdbId})
    .from(movies)
    .where(
      sql`${movies.imdbId} IS NOT NULL AND ${movies.tmdbId} IS NULL AND ${movies.deletedAt} IS NULL`,
    )
    .limit(limit);

  return filterMoviesWithImdbId(normalizeMovies(moviesWithImdbIdNoTmdb));
}

async function fetchAndStorePosterUrls(
  environment: Environment,
  tmdbApiKey: string,
  limit = 10,
): Promise<{
  processed: number;
  success: number;
  failed: number;
  results: Array<{
    movieUid: string;
    imdbId: string;
    postersAdded: number;
    error?: string;
  }>;
}> {
  const moviesWithImdbId = await getMoviesWithImdbId(environment, limit);
  console.log(`処理対象の映画: ${moviesWithImdbId.length}件`);

  const results: {
    processed: number;
    success: number;
    failed: number;
    results: Array<{
      movieUid: string;
      imdbId: string;
      postersAdded: number;
      error?: string;
    }>;
  } = {
    processed: 0,
    success: 0,
    failed: 0,
    results: [],
  };

  for (const movie of moviesWithImdbId) {
    console.log(
      `[${results.processed + 1}/${
        moviesWithImdbId.length
      }] 処理開始: IMDb ID ${movie.imdbId}`,
    );

    results.processed++;
    const result: {
      movieUid: string;
      imdbId: string;
      postersAdded: number;
      error?: string;
    } = {
      movieUid: movie.uid,
      imdbId: movie.imdbId,
      postersAdded: 0,
    };

    try {
      // 既にTMDB IDがある映画の場合、ポスター取得のみ行う
      if (movie.tmdbId === undefined) {
        // TMDB IDがない場合は、IMDb IDから検索
        console.log('  TMDb API からポスター情報を取得中...');
        const movieData = await fetchTMDBMovieImages(movie.imdbId, tmdbApiKey);

        if (movieData) {
          // TMDB ID を保存
          await saveTMDBId(
            movie.imdbId,
            movieData.tmdbId,
            environment,
            movieData.mediaType,
          );

          if (
            !movieData.images.posters ||
            movieData.images.posters.length === 0
          ) {
            result.error = 'No posters found';
            results.failed++;
            console.log('  ✘ ポスターが見つかりませんでした');
          } else {
            console.log(
              `  ポスター候補: ${movieData.images.posters.length}枚見つかりました`,
            );
            console.log('  データベースに保存中...');
            const savedCount = await savePosterUrls(
              movie.uid,
              movieData.images.posters,
              environment,
            );
            result.postersAdded = savedCount;

            if (savedCount > 0) {
              results.success++;
              console.log(`  ✓ ${savedCount}枚のポスターを保存しました`);
            } else {
              results.failed++;
              result.error = 'No new posters saved';
              console.log('  ✘ 新しいポスターはありませんでした');
            }
          }
        } else {
          result.error = 'No TMDb data found';
          results.failed++;
          console.log('  ✘ TMDb データが見つかりませんでした');
        }
      } else {
        console.log(`  既存のTMDB ID を使用: ${movie.tmdbId}`);

        // TMDB IDから直接ポスター情報を取得
        const images = await fetchTMDBImages(movie.tmdbId, 'movie', tmdbApiKey);

        if (!images) {
          throw new Error(
            `Failed to fetch TMDb images for TMDb ID ${movie.tmdbId}`,
          );
        }

        if (!images.posters || images.posters.length === 0) {
          result.error = 'No posters found';
          results.failed++;
          console.log('  ✘ ポスターが見つかりませんでした');
        } else {
          console.log(
            `  ポスター候補: ${images.posters.length}枚見つかりました`,
          );
          console.log('  データベースに保存中...');
          const savedCount = await savePosterUrls(
            movie.uid,
            images.posters,
            environment,
          );
          result.postersAdded = savedCount;

          if (savedCount > 0) {
            results.success++;
            console.log(`  ✓ ${savedCount}枚のポスターを保存しました`);
          } else {
            results.failed++;
            result.error = 'No new posters saved';
            console.log('  ✘ 新しいポスターはありませんでした');
          }
        }
      }
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
      results.failed++;
      console.log(`  ✘ エラーが発生しました: ${result.error}`);
    }

    results.results.push(result);
    console.log(
      `[${results.processed}/${moviesWithImdbId.length}] 処理完了: IMDb ID ${movie.imdbId}`,
    );
    console.log(
      `進捗状況: 成功=${results.success}, 失敗=${results.failed}, 合計=${results.processed}/${moviesWithImdbId.length}`,
    );
    console.log('------------------------------');
  }

  console.log(
    `処理完了: 合計=${results.processed}件 (成功=${results.success}件, 失敗=${results.failed}件)`,
  );
  const totalPosters = results.results.reduce(
    (sum, item) => sum + item.postersAdded,
    0,
  );
  console.log(`保存されたポスター数: 合計${totalPosters}枚`);

  return results;
}
