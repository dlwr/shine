import { getDatabase, type Environment } from "db";
import { movies } from "db/schema/movies";
import { posterUrls } from "db/schema/poster-urls";
import { eq, isNotNull, sql } from "drizzle-orm";

const TMDB_API_BASE_URL = "https://api.themoviedb.org/3";

interface TMDBMovieImages {
  id: number;
  posters: {
    file_path: string;
    width: number;
    height: number;
    iso_639_1: string | null;
  }[];
}

interface TMDBFindResponse {
  movie_results: {
    id: number;
    title: string;
  }[];
}

interface MovieWithImdbId {
  uid: string;
  imdbId: string;
}

let environment_: Environment;
let TMDB_API_KEY: string | undefined;

export default {
  async fetch(request: Request, environment: Environment): Promise<Response> {
    environment_ = environment;
    TMDB_API_KEY = environment.TMDB_API_KEY;

    if (!TMDB_API_KEY) {
      return new Response("TMDB_API_KEY is not set", { status: 500 });
    }

    try {
      const url = new URL(request.url);
      const processCountParameter = url.searchParams.get("count");
      const processCount = processCountParameter
        ? Number.parseInt(processCountParameter, 10)
        : 10;

      const result = await fetchAndStorePosterUrls(processCount);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Error processing posters:", error);
      return new Response(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
        { status: 500 }
      );
    }
  },
};

async function getMoviesWithImdbId(limit = 10): Promise<MovieWithImdbId[]> {
  const database = getDatabase(environment_);

  const moviesWithoutPosters = await database
    .select({ uid: movies.uid, imdbId: movies.imdbId })
    .from(movies)
    .leftJoin(posterUrls, eq(movies.uid, posterUrls.movieUid))
    .where(sql`${movies.imdbId} IS NOT NULL AND ${posterUrls.uid} IS NULL`)
    .limit(limit);

  const filteredMoviesWithoutPosters = moviesWithoutPosters.filter(
    (movie): movie is MovieWithImdbId => movie.imdbId !== null
  );

  if (filteredMoviesWithoutPosters.length > 0) {
    return filteredMoviesWithoutPosters;
  }

  const moviesWithImdbId = await database
    .select({ uid: movies.uid, imdbId: movies.imdbId })
    .from(movies)
    .where(isNotNull(movies.imdbId))
    .limit(limit);

  return moviesWithImdbId.filter(
    (movie): movie is MovieWithImdbId => movie.imdbId !== null
  );
}

async function fetchMovieImages(
  imdbId: string
): Promise<TMDBMovieImages | undefined> {
  if (!TMDB_API_KEY) {
    console.error("TMDb API key is not set");
    return undefined;
  }

  try {
    const findUrl = new URL(`${TMDB_API_BASE_URL}/find/${imdbId}`);
    findUrl.searchParams.append("api_key", TMDB_API_KEY);
    findUrl.searchParams.append("external_source", "imdb_id");

    const findResponse = await fetch(findUrl.toString());
    if (!findResponse.ok) {
      throw new Error(`TMDb API error: ${findResponse.statusText}`);
    }

    const findData = (await findResponse.json()) as TMDBFindResponse;
    const movieResults = findData.movie_results;

    if (!movieResults || movieResults.length === 0) {
      console.log(`No TMDb match found for IMDb ID: ${imdbId}`);
      return undefined;
    }

    const tmdbId = movieResults[0].id;

    const imagesUrl = new URL(`${TMDB_API_BASE_URL}/movie/${tmdbId}/images`);
    imagesUrl.searchParams.append("api_key", TMDB_API_KEY);

    const imagesResponse = await fetch(imagesUrl.toString());
    if (!imagesResponse.ok) {
      throw new Error(`TMDb API error: ${imagesResponse.statusText}`);
    }

    return (await imagesResponse.json()) as TMDBMovieImages;
  } catch (error) {
    console.error(`Error fetching TMDb images for IMDb ID ${imdbId}:`, error);
    return undefined;
  }
}

async function savePosterUrls(
  movieUid: string,
  posters: TMDBMovieImages["posters"]
): Promise<number> {
  if (!posters || posters.length === 0) {
    return 0;
  }

  const database = getDatabase(environment_);
  let savedCount = 0;

  try {
    const existingPosters = await database
      .select({ url: posterUrls.url })
      .from(posterUrls)
      .where(eq(posterUrls.movieUid, movieUid));

    const existingUrls = new Set(existingPosters.map((p) => p.url));

    for (const poster of posters) {
      const url = `https://image.tmdb.org/t/p/original${poster.file_path}`;

      if (existingUrls.has(url)) {
        continue;
      }

      await database.insert(posterUrls).values({
        movieUid,
        url,
        width: poster.width,
        height: poster.height,
        languageCode: poster.iso_639_1 || undefined,
        sourceType: "tmdb",
        isPrimary: savedCount === 0 ? 1 : 0,
      });

      savedCount++;
    }

    return savedCount;
  } catch (error) {
    console.error(`Error saving poster URLs for movie ${movieUid}:`, error);
    throw error;
  }
}

async function fetchAndStorePosterUrls(limit = 10): Promise<{
  processed: number;
  success: number;
  failed: number;
  results: {
    movieUid: string;
    imdbId: string;
    postersAdded: number;
    error?: string;
  }[];
}> {
  const moviesWithImdbId = await getMoviesWithImdbId(limit);
  console.log(`処理対象の映画: ${moviesWithImdbId.length}件`);

  const results: {
    processed: number;
    success: number;
    failed: number;
    results: {
      movieUid: string;
      imdbId: string;
      postersAdded: number;
      error?: string;
    }[];
  } = {
    processed: 0,
    success: 0,
    failed: 0,
    results: [],
  };

  for (const movie of moviesWithImdbId) {
    console.log(
      `[${results.processed + 1}/${moviesWithImdbId.length}] 処理開始: IMDb ID ${movie.imdbId}`
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
      console.log(`  TMDb API からポスター情報を取得中...`);
      const imagesData = await fetchMovieImages(movie.imdbId);

      if (
        !imagesData ||
        !imagesData.posters ||
        imagesData.posters.length === 0
      ) {
        result.error = "No posters found";
        results.failed++;
        console.log(`  ✘ ポスターが見つかりませんでした`);
      } else {
        console.log(
          `  ポスター候補: ${imagesData.posters.length}枚見つかりました`
        );
        console.log(`  データベースに保存中...`);
        const savedCount = await savePosterUrls(movie.uid, imagesData.posters);
        result.postersAdded = savedCount;

        if (savedCount > 0) {
          results.success++;
          console.log(`  ✓ ${savedCount}枚のポスターを保存しました`);
        } else {
          results.failed++;
          result.error = "No new posters saved";
          console.log(`  ✘ 新しいポスターはありませんでした`);
        }
      }
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
      results.failed++;
      console.log(`  ✘ エラーが発生しました: ${result.error}`);
    }

    results.results.push(result);
    console.log(
      `[${results.processed}/${moviesWithImdbId.length}] 処理完了: IMDb ID ${movie.imdbId}`
    );
    console.log(
      `進捗状況: 成功=${results.success}, 失敗=${results.failed}, 合計=${results.processed}/${moviesWithImdbId.length}`
    );
    console.log(`------------------------------`);
  }

  console.log(
    `処理完了: 合計=${results.processed}件 (成功=${results.success}件, 失敗=${results.failed}件)`
  );
  const totalPosters = results.results.reduce(
    (sum, item) => sum + item.postersAdded,
    0
  );
  console.log(`保存されたポスター数: 合計${totalPosters}枚`);

  return results;
}
