import { eq } from "drizzle-orm";
import { getDatabase, type Environment } from "../../../../src/index";
import { movies } from "../../../../src/schema/movies";

const TMDB_API_BASE_URL = "https://api.themoviedb.org/3";

interface TMDBMovieData {
  id: number;
  title: string;
  original_title: string;
  release_date: string;
}

interface TMDBFindResponse {
  movie_results: TMDBMovieData[];
}

/**
 * TMDBから日本語タイトルを取得する
 * @param imdbId IMDb ID
 * @param tmdbId TMDB ID (既知の場合)
 * @param environment 環境変数
 * @returns 日本語タイトル（見つからない場合はundefined）
 */
export async function fetchJapaneseTitleFromTMDB(
  imdbId: string,
  tmdbId: number | null,
  environment: Environment,
): Promise<string | undefined> {
  const TMDB_API_KEY = environment.TMDB_API_KEY;

  if (!TMDB_API_KEY) {
    console.error("TMDB_API_KEY is not set");
    return undefined;
  }

  try {
    let movieTmdbId = tmdbId;

    // TMDB IDがない場合は、IMDb IDから検索
    if (!movieTmdbId) {
      console.log(`  TMDB ID not found, searching by IMDb ID: ${imdbId}`);

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
        console.log(`  No TMDb match found for IMDb ID: ${imdbId}`);
        return undefined;
      }

      movieTmdbId = movieResults[0].id;
      console.log(`  Found TMDB ID: ${movieTmdbId}`);

      // TMDB IDをデータベースに保存
      await saveTMDBId(imdbId, movieTmdbId, environment);
    }

    // 日本語の映画情報を取得
    const movieUrl = new URL(`${TMDB_API_BASE_URL}/movie/${movieTmdbId}`);
    movieUrl.searchParams.append("api_key", TMDB_API_KEY);
    movieUrl.searchParams.append("language", "ja");

    const movieResponse = await fetch(movieUrl.toString());
    if (!movieResponse.ok) {
      throw new Error(`TMDb API error: ${movieResponse.statusText}`);
    }

    const movieData = (await movieResponse.json()) as TMDBMovieData;

    // 日本語タイトルが取得できたか確認
    if (movieData.title && movieData.title !== movieData.original_title) {
      console.log(`  Found Japanese title: ${movieData.title}`);
      return movieData.title;
    }

    console.log(`  No Japanese title found in TMDB`);
    return undefined;
  } catch (error) {
    console.error(
      `Error fetching Japanese title from TMDB for IMDb ID ${imdbId}:`,
      error,
    );
    return undefined;
  }
}

/**
 * TMDB IDをデータベースに保存する
 * @param imdbId IMDb ID
 * @param tmdbId TMDB ID
 * @param environment 環境変数
 */
async function saveTMDBId(
  imdbId: string,
  tmdbId: number,
  environment: Environment,
): Promise<void> {
  const database = getDatabase(environment);

  try {
    // IMDb IDで映画を検索
    const movie = await database
      .select({ uid: movies.uid, tmdbId: movies.tmdbId })
      .from(movies)
      .where(eq(movies.imdbId, imdbId))
      .limit(1);

    if (movie.length === 0) {
      console.error(`  Movie not found with IMDb ID: ${imdbId}`);
      return;
    }

    if (movie[0].tmdbId !== null) {
      console.log(`  TMDB ID already exists: ${movie[0].tmdbId}`);
      return;
    }

    // 他の映画で同じTMDB IDが使用されていないかチェック
    const duplicateMovie = await database
      .select({ uid: movies.uid })
      .from(movies)
      .where(eq(movies.tmdbId, tmdbId))
      .limit(1);

    if (duplicateMovie.length > 0) {
      console.log(
        `  TMDB ID ${tmdbId} is already used by another movie (${duplicateMovie[0].uid})`,
      );
      return;
    }

    // TMDB IDを更新
    await database
      .update(movies)
      .set({ tmdbId })
      .where(eq(movies.imdbId, imdbId));

    console.log(`  Saved TMDB ID: ${tmdbId}`);
  } catch (error) {
    console.error(`Error saving TMDB ID for IMDb ID ${imdbId}:`, error);
  }
}
