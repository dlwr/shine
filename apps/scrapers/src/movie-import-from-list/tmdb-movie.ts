import {and, eq, or} from 'drizzle-orm';
import {getDatabase, type Environment} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {posterUrls} from '@shine/database/schema/poster-urls';
import {translations} from '@shine/database/schema/translations';
import {generateUUID} from '@shine/utils';
import {withDefaultTranslationFlags} from '../common/default-translations';
import {searchTMDBMovies, type TMDBConfig} from '../common/tmdb-client';
import {pickJapaneseTitle} from '../common/tmdb-japanese-title';

export type TMDBMovieData = {
  id: number;
  title: string;
  original_title: string;
  original_language: string | undefined;
  release_date: string;
  poster_path: string | undefined;
  imdb_id: string | undefined;
  overview: string;
};

export type ImportContext = {
  environment: Environment;
  tmdbApiKey: string;
  tmdbConfig: TMDBConfig | undefined;
  isDryRun: boolean;
};

/**
 * TMDBで映画を検索
 */
export async function searchMovieOnTMDB(
  context: ImportContext,
  title: string,
): Promise<TMDBMovieData | undefined> {
  try {
    const results = await searchTMDBMovies(context.tmdbApiKey, {
      query: title,
      language: 'ja',
    });

    if (results.length === 0) {
      return undefined;
    }

    // 最初の結果を返す（最も関連性が高いとされる）
    const movie = results[0];
    const sanitizedMovie: TMDBMovieData = {
      id: movie.id,
      title: movie.title,
      original_title: movie.original_title ?? movie.title,
      original_language: movie.original_language ?? undefined,
      release_date: movie.release_date ?? '',
      poster_path: movie.poster_path ?? undefined,
      imdb_id: undefined,
      overview: movie.overview ?? '',
    };
    console.log(
      `  Found on TMDB: ${sanitizedMovie.title} (${
        sanitizedMovie.release_date.split('-', 1)[0] || 'Unknown'
      })`,
    );

    return sanitizedMovie;
  } catch (error) {
    console.error(`Error searching TMDB for ${title}:`, error);
    return undefined;
  }
}

export async function findExistingMovieForTmdbMovie(
  database: ReturnType<typeof getDatabase>,
  tmdbMovie: {id: number; imdb_id?: string | undefined},
): Promise<typeof movies.$inferSelect | undefined> {
  const sameTmdbMovie = and(
    eq(movies.tmdbId, tmdbMovie.id),
    eq(movies.mediaType, 'movie'),
  );
  const [existingMovie] = await database
    .select()
    .from(movies)
    .where(
      tmdbMovie.imdb_id
        ? or(sameTmdbMovie, eq(movies.imdbId, tmdbMovie.imdb_id))
        : sameTmdbMovie,
    )
    .limit(1);
  return existingMovie;
}

/**
 * バッチ処理用に新しい映画を作成
 */
export async function createNewMovieForBatch(
  context: ImportContext,
  tmdbMovie: TMDBMovieData,
): Promise<{
  movieUid: string;
  translations: Array<typeof translations.$inferInsert>;
  posterUrl?: typeof posterUrls.$inferInsert;
}> {
  const database = getDatabase(context.environment);
  const movieUid = generateUUID();

  // 公開年を抽出
  const releaseYear = tmdbMovie.release_date
    ? Number(tmdbMovie.release_date.split('-', 1)[0])
    : undefined;

  // 映画を作成（これは即座に実行する必要がある）
  await database.insert(movies).values({
    uid: movieUid,
    originalLanguage: tmdbMovie.original_language ?? 'en',
    year: releaseYear,
    tmdbId: tmdbMovie.id,
    imdbId: tmdbMovie.imdb_id,
  });

  const translationRows: Array<typeof translations.$inferInsert> = [];

  if (tmdbMovie.original_title) {
    console.log(`  Saving EN title: "${tmdbMovie.original_title}"`);
    translationRows.push({
      resourceType: 'movie_title',
      resourceUid: movieUid,
      languageCode: 'en',
      content: tmdbMovie.original_title,
    });
  } else {
    console.log('  WARN: tmdbMovie.original_title is undefined!');
  }

  // 日本語翻訳を追加
  const japaneseTitle = pickJapaneseTitle(tmdbMovie);
  if (japaneseTitle) {
    console.log(`  Adding JA title: "${japaneseTitle}"`);
    translationRows.push({
      resourceType: 'movie_title',
      resourceUid: movieUid,
      languageCode: 'ja',
      content: japaneseTitle,
    });
  }

  const translationsBatch = withDefaultTranslationFlags(
    tmdbMovie.original_language ?? 'en',
    translationRows,
  );

  // ポスターURL
  let posterUrlData: typeof posterUrls.$inferInsert | undefined;
  if (context.tmdbConfig && tmdbMovie.poster_path) {
    const posterUrl = `${context.tmdbConfig.images.secure_base_url}w500${tmdbMovie.poster_path}`;
    posterUrlData = {
      movieUid,
      url: posterUrl,
      sourceType: 'tmdb',
    };
  }

  return {
    movieUid,
    translations: translationsBatch,
    posterUrl: posterUrlData,
  };
}

/**
 * 既存の映画を更新（差分チェック付き）
 */
export async function updateExistingMovie(
  context: ImportContext,
  movieUid: string,
  tmdbMovie: TMDBMovieData,
): Promise<void> {
  const database = getDatabase(context.environment);

  // 既存の映画データを取得
  const [existingMovie] = await database
    .select()
    .from(movies)
    .where(eq(movies.uid, movieUid))
    .limit(1);

  if (!existingMovie) {
    return;
  }

  // 差分チェックして更新が必要な場合のみ更新
  const updates: Partial<typeof movies.$inferInsert> = {};

  if (!existingMovie.tmdbId && tmdbMovie.id) {
    updates.tmdbId = tmdbMovie.id;
  }

  if (!existingMovie.imdbId && tmdbMovie.imdb_id) {
    updates.imdbId = tmdbMovie.imdb_id;
  }

  if (Object.keys(updates).length > 0) {
    console.log(`  Updating movie with: ${JSON.stringify(updates)}`);
    await database.update(movies).set(updates).where(eq(movies.uid, movieUid));
  }

  // ポスターURLを追加（まだない場合）
  if (context.tmdbConfig && tmdbMovie.poster_path) {
    const [existingPoster] = await database
      .select()
      .from(posterUrls)
      .where(eq(posterUrls.movieUid, movieUid))
      .limit(1);

    if (!existingPoster) {
      const posterUrl = `${context.tmdbConfig.images.secure_base_url}w500${tmdbMovie.poster_path}`;
      await database.insert(posterUrls).values({
        movieUid,
        url: posterUrl,
        sourceType: 'tmdb',
      });
    }
  }
}
