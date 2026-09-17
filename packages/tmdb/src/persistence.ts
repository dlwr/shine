/**
 * TMDb から取ったものを DB に書く側。HTTP は client.ts
 */
import {and, eq} from 'drizzle-orm';
import {getDatabase, type Environment} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {posterUrls} from '@shine/database/schema/poster-urls';
import {translations} from '@shine/database/schema/translations';
import {
  fetchTMDBDetails,
  findTMDBByImdbId,
  type TMDBMediaType,
  type TMDBMovieImages,
} from './client';
import {pickJapaneseTitle} from './japanese-title';

/**
 * TMDb APIから日本語タイトルを取得。TMDb ID が無ければ IMDb ID から引いて保存する
 */
export async function fetchJapaneseTitleFromTMDB(
  imdbId: string,
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

    let mediaType: TMDBMediaType = 'movie';

    if (!movieTmdbId) {
      console.log(`  TMDB ID not found, searching by IMDb ID: ${imdbId}`);
      const findResult = await findTMDBByImdbId(imdbId, TMDB_API_KEY);

      if (!findResult) {
        return undefined;
      }

      movieTmdbId = findResult.tmdbId;
      mediaType = findResult.mediaType;

      console.log(`  Found TMDB ID: ${movieTmdbId} (${mediaType})`);
      await saveTMDBId(imdbId, movieTmdbId, environment, mediaType);
    }

    const movieData = await fetchTMDBDetails(
      movieTmdbId,
      mediaType,
      TMDB_API_KEY,
      'ja',
    );

    if (!movieData) {
      return undefined;
    }

    const japaneseTitle = pickJapaneseTitle(movieData);
    if (japaneseTitle) {
      console.log(`  Found Japanese title: ${japaneseTitle}`);
      return japaneseTitle;
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
 */
export async function saveTMDBId(
  imdbId: string,
  tmdbId: number,
  environment: Environment,
  mediaType: TMDBMediaType,
): Promise<void> {
  const database = getDatabase(environment);

  try {
    const movie = await database
      .select({
        uid: movies.uid,
        tmdbId: movies.tmdbId,
        deletedAt: movies.deletedAt,
      })
      .from(movies)
      .where(eq(movies.imdbId, imdbId))
      .limit(1);

    if (movie.length === 0) {
      console.error(`  Movie not found with IMDb ID: ${imdbId}`);
      return;
    }

    if (movie[0].deletedAt !== null) {
      console.log(`  Movie is soft-deleted, skipping: ${imdbId}`);
      return;
    }

    if (movie[0].tmdbId !== null) {
      console.log(`  TMDB ID already exists: ${movie[0].tmdbId}`);
      return;
    }

    const duplicateMovie = await database
      .select({uid: movies.uid})
      .from(movies)
      .where(and(eq(movies.tmdbId, tmdbId), eq(movies.mediaType, mediaType)))
      .limit(1);

    if (duplicateMovie.length > 0) {
      console.log(
        `  TMDB ID ${tmdbId} is already used by another movie (${duplicateMovie[0].uid})`,
      );
      return;
    }

    await database
      .update(movies)
      .set({tmdbId, mediaType})
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
  environment: Environment,
): Promise<void> {
  const database = getDatabase(environment);

  try {
    await database
      .insert(translations)
      .values({
        resourceType: 'movie_title',
        resourceUid: movieUid,
        languageCode: 'ja',
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
        },
      });

    console.log(`  Saved Japanese title: ${japaneseTitle}`);
  } catch (error) {
    console.error('Error saving Japanese translation:', error);
  }
}

/**
 * ポスターURLをデータベースに保存
 */
export async function savePosterUrls(
  movieUid: string,
  posters: TMDBMovieImages['posters'],
  environment: Environment,
): Promise<number> {
  if (!posters || posters.length === 0) {
    return 0;
  }

  const database = getDatabase(environment);
  let savedCount = 0;

  try {
    const existingPosters = await database
      .select({url: posterUrls.url})
      .from(posterUrls)
      .where(eq(posterUrls.movieUid, movieUid));

    const existingUrls = new Set(
      existingPosters.map((poster: {url: string}) => poster.url),
    );

    for (const poster of posters) {
      const url = `https://image.tmdb.org/t/p/original${poster.file_path}`;

      if (existingUrls.has(url)) {
        continue;
      }

      const posterValues: typeof posterUrls.$inferInsert = {
        movieUid,
        url,
        width: poster.width,
        height: poster.height,
        sourceType: 'tmdb',
        isPrimary: savedCount === 0 ? 1 : 0,
      };

      if (poster.iso_639_1) {
        posterValues.languageCode = poster.iso_639_1;
      }

      await database.insert(posterUrls).values(posterValues);

      savedCount++;
    }

    return savedCount;
  } catch (error) {
    console.error(`Error saving poster URLs for movie ${movieUid}:`, error);
    throw error;
  }
}
