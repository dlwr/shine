/**
 * TMDb API関連の共通ユーティリティ
 */
import { eq } from "drizzle-orm";
import { getDatabase, type Environment } from "../../../src/index";
import { movies } from "../../../src/schema/movies";
import { posterUrls } from "../../../src/schema/poster-urls";
import { translations } from "../../../src/schema/translations";

const TMDB_API_BASE_URL = "https://api.themoviedb.org/3";

// TMDb API型定義
export interface TMDBMovieData {
  id: number;
  title: string;
  original_title: string;
  release_date: string;
  imdb_id?: string;
}

export interface TMDBFindResponse {
  movie_results: TMDBMovieData[];
}

export interface TMDBMovieImages {
  id: number;
  posters: {
    file_path: string;
    width: number;
    height: number;
    iso_639_1: string | null;
  }[];
}

export interface TMDBSearchResponse {
  results: {
    id: number;
    title: string;
    release_date: string;
  }[];
}

/**
 * TMDb APIを使って映画を検索（タイトルと年で）
 */
export async function searchTMDBMovie(
  title: string,
  year: number,
  tmdbApiKey: string
): Promise<number | undefined> {
  try {
    const searchUrl = new URL(`${TMDB_API_BASE_URL}/search/movie`);
    searchUrl.searchParams.append("api_key", tmdbApiKey);
    searchUrl.searchParams.append("query", title);
    searchUrl.searchParams.append("year", year.toString());
    searchUrl.searchParams.append("language", "en-US");

    const response = await fetch(searchUrl.toString());
    if (!response.ok) {
      throw new Error(`TMDb API error: ${response.statusText}`);
    }

    const data = (await response.json()) as TMDBSearchResponse;

    // 結果をフィルタリング
    const matches = data.results.filter((movie) => {
      const movieYear = new Date(movie.release_date).getFullYear();
      return Math.abs(movieYear - year) <= 1; // 1年の誤差を許容
    });

    // 最も関連性の高い結果を返す
    return matches.length > 0 ? matches[0].id : undefined;
  } catch (error) {
    console.error(`Error searching TMDb for ${title} (${year}):`, error);
    return undefined;
  }
}

/**
 * TMDb APIから映画の詳細情報を取得
 */
export async function fetchTMDBMovieDetails(
  movieId: number,
  tmdbApiKey: string,
  language = "en-US"
): Promise<TMDBMovieData | undefined> {
  try {
    const detailsUrl = new URL(`${TMDB_API_BASE_URL}/movie/${movieId}`);
    detailsUrl.searchParams.append("api_key", tmdbApiKey);
    detailsUrl.searchParams.append("language", language);

    const response = await fetch(detailsUrl.toString());
    if (!response.ok) {
      throw new Error(`TMDb API error: ${response.statusText}`);
    }

    const data = (await response.json()) as TMDBMovieData;
    return data;
  } catch (error) {
    console.error(
      `Error fetching TMDb movie details for ID ${movieId}:`,
      error
    );
    return undefined;
  }
}

/**
 * IMDb IDからTMDb IDを取得
 */
export async function findTMDBByImdbId(
  imdbId: string,
  tmdbApiKey: string
): Promise<number | undefined> {
  try {
    const findUrl = new URL(`${TMDB_API_BASE_URL}/find/${imdbId}`);
    findUrl.searchParams.append("api_key", tmdbApiKey);
    findUrl.searchParams.append("external_source", "imdb_id");

    const response = await fetch(findUrl.toString());
    if (!response.ok) {
      throw new Error(`TMDb API error: ${response.statusText}`);
    }

    const data = (await response.json()) as TMDBFindResponse;
    const movieResults = data.movie_results;

    if (!movieResults || movieResults.length === 0) {
      console.log(`No TMDb match found for IMDb ID: ${imdbId}`);
      return undefined;
    }

    return movieResults[0].id;
  } catch (error) {
    console.error(`Error finding TMDb ID for IMDb ID ${imdbId}:`, error);
    return undefined;
  }
}

/**
 * TMDb APIから日本語タイトルを取得
 */
export async function fetchJapaneseTitleFromTMDB(
  imdbId: string,
  tmdbId: number | undefined,
  environment: Environment
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
      const foundTmdbId = await findTMDBByImdbId(imdbId, TMDB_API_KEY);

      if (!foundTmdbId) {
        return undefined;
      }

      movieTmdbId = foundTmdbId;

      console.log(`  Found TMDB ID: ${movieTmdbId}`);
      // TMDB IDをデータベースに保存
      await saveTMDBId(imdbId, movieTmdbId, environment);
    }

    // 日本語の映画情報を取得
    const movieData = await fetchTMDBMovieDetails(
      movieTmdbId,
      TMDB_API_KEY,
      "ja"
    );

    if (!movieData) {
      return undefined;
    }

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
      error
    );
    return undefined;
  }
}

/**
 * TMDb APIから映画のポスター情報を取得
 */
export async function fetchTMDBMovieImages(
  imdbId: string,
  tmdbApiKey: string
): Promise<{ images: TMDBMovieImages; tmdbId: number } | undefined> {
  try {
    const tmdbId = await findTMDBByImdbId(imdbId, tmdbApiKey);
    if (!tmdbId) {
      return undefined;
    }

    const imagesUrl = new URL(`${TMDB_API_BASE_URL}/movie/${tmdbId}/images`);
    imagesUrl.searchParams.append("api_key", tmdbApiKey);

    const imagesResponse = await fetch(imagesUrl.toString());
    if (!imagesResponse.ok) {
      throw new Error(`TMDb API error: ${imagesResponse.statusText}`);
    }

    const images = (await imagesResponse.json()) as TMDBMovieImages;
    return { images, tmdbId };
  } catch (error) {
    console.error(`Error fetching TMDb images for IMDb ID ${imdbId}:`, error);
    return undefined;
  }
}

/**
 * TMDB IDをデータベースに保存する
 */
export async function saveTMDBId(
  imdbId: string,
  tmdbId: number,
  environment: Environment
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
        `  TMDB ID ${tmdbId} is already used by another movie (${duplicateMovie[0].uid})`
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

/**
 * 日本語翻訳をデータベースに保存
 */
export async function saveJapaneseTranslation(
  movieUid: string,
  japaneseTitle: string,
  environment: Environment
): Promise<void> {
  const database = getDatabase(environment);

  try {
    await database
      .insert(translations)
      .values({
        resourceType: "movie_title",
        resourceUid: movieUid,
        languageCode: "ja",
        content: japaneseTitle,
        isDefault: 1,
      })
      .onConflictDoUpdate({
        target: [
          translations.resourceType,
          translations.resourceUid,
          translations.languageCode,
        ],
        set: {
          content: japaneseTitle,
          updatedAt: Math.floor(Date.now() / 1000),
        },
      });

    console.log(`  Saved Japanese title: ${japaneseTitle}`);
  } catch (error) {
    console.error(`Error saving Japanese translation:`, error);
  }
}

/**
 * ポスターURLをデータベースに保存
 */
export async function savePosterUrls(
  movieUid: string,
  posters: TMDBMovieImages["posters"],
  environment: Environment
): Promise<number> {
  if (!posters || posters.length === 0) {
    return 0;
  }

  const database = getDatabase(environment);
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

/**
 * IMDb IDを取得する関数（検索ベース）
 */
export async function fetchImdbId(
  title: string,
  year: number,
  tmdbApiKey: string
): Promise<string | undefined> {
  try {
    // TMDbで映画を検索
    const movieId = await searchTMDBMovie(title, year, tmdbApiKey);
    if (!movieId) {
      console.log(`No TMDb match found for ${title} (${year})`);
      return undefined;
    }

    // 映画の詳細情報を取得
    const movieData = await fetchTMDBMovieDetails(movieId, tmdbApiKey);
    if (movieData?.imdb_id) {
      console.log(`Found IMDb ID for ${title} (${year}): ${movieData.imdb_id}`);
      return movieData.imdb_id;
    } else {
      console.log(`No IMDb ID found for ${title} (${year})`);
    }

    return undefined;
  } catch (error) {
    console.error(`Error fetching IMDb ID for ${title} (${year}):`, error);
    return undefined;
  }
}
