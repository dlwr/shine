import type {Environment} from '@shine/database';
import {saveTMDBId} from '../../common/tmdb-utilities';
import {isValidImdbId} from './imdb-id';

const TMDB_API_BASE_URL = 'https://api.themoviedb.org/3';

/**
 * TMDBから日本語タイトルを取得する
 * @param imdbId IMDb ID
 * @param tmdbId TMDB ID (既知の場合)
 * @param environment 環境変数
 * @returns 日本語タイトル（見つからない場合はundefined）
 */
export async function fetchJapaneseTitleFromTMDB(
  imdbId: string | undefined,
  tmdbId: number | undefined,
  environment: Environment,
): Promise<string | undefined> {
  const {TMDB_API_KEY} = environment;

  if (!TMDB_API_KEY) {
    console.error('TMDB_API_KEY is not set');
    return undefined;
  }

  try {
    let movieTmdbId = tmdbId;

    // TMDB IDがない場合は、IMDb IDから検索
    if (!movieTmdbId) {
      if (!isValidImdbId(imdbId)) {
        console.log(`  Skipped TMDb lookup: no TMDb ID and invalid IMDb ID`);
        return undefined;
      }

      console.log(`  TMDB ID not found, searching by IMDb ID: ${imdbId}`);

      const findUrl = new URL(`${TMDB_API_BASE_URL}/find/${imdbId}`);
      findUrl.searchParams.append('api_key', TMDB_API_KEY);
      findUrl.searchParams.append('external_source', 'imdb_id');

      const findResponse = await fetch(findUrl.href);
      if (!findResponse.ok) {
        throw new Error(`TMDb API error: ${findResponse.statusText}`);
      }

      const findData: {
        movie_results?: Array<{id: number}>;
      } = await findResponse.json();
      const movieResults = findData.movie_results;

      if (!movieResults || movieResults.length === 0) {
        console.log(`  No TMDb match found for IMDb ID: ${imdbId}`);
        return undefined;
      }

      movieTmdbId = movieResults[0].id;
      console.log(`  Found TMDB ID: ${movieTmdbId}`);

      // TMDB IDをデータベースに保存
      await saveTMDBId(imdbId, movieTmdbId, environment, 'movie');
    }

    // 日本語の映画情報を取得
    const movieUrl = new URL(`${TMDB_API_BASE_URL}/movie/${movieTmdbId}`);
    movieUrl.searchParams.append('api_key', TMDB_API_KEY);
    movieUrl.searchParams.append('language', 'ja');

    const movieResponse = await fetch(movieUrl.href);
    if (!movieResponse.ok) {
      throw new Error(`TMDb API error: ${movieResponse.statusText}`);
    }

    const movieData: {
      title?: string;
      original_title?: string;
    } = await movieResponse.json();

    // 日本語タイトルが取得できたか確認
    if (movieData.title && movieData.title !== movieData.original_title) {
      console.log(`  Found Japanese title: ${movieData.title}`);
      return movieData.title;
    }

    console.log('  No Japanese title found in TMDB');
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
