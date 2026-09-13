import {setTimeout as sleep} from 'node:timers/promises';
import {and, eq} from 'drizzle-orm';
import {movies} from '@shine/database/schema/movies';
import {translations} from '@shine/database/schema/translations';
import {withDefaultTranslationFlags} from '../common/default-translations';
import {
  insertImdbAndTmdbReferenceUrls,
  insertTmdbPosterUrl,
} from '../common/movie-reference-records';
import {pickJapaneseTitle} from '../common/tmdb-japanese-title';
import {
  fetchTMDBConfig,
  fetchTMDBMovieDetails,
  findTMDBByImdbId,
  type TMDBMovieData,
} from '../common/tmdb-utilities';
import {type AwardFilm, type DatabaseClient, type ImportContext} from './types';

export async function createMovie(
  context: ImportContext,
  film: AwardFilm,
  editionYear: number,
): Promise<string | undefined> {
  const {database, tmdbApiKey, stats} = context;

  let details: TMDBMovieData | undefined;
  let detailsJa: TMDBMovieData | undefined;
  if (tmdbApiKey) {
    const found = await findTMDBByImdbId(film.imdbId, tmdbApiKey);
    if (found?.mediaType === 'movie') {
      details = await fetchTMDBMovieDetails(found.tmdbId, tmdbApiKey, 'en-US');
      detailsJa = await fetchTMDBMovieDetails(found.tmdbId, tmdbApiKey, 'ja');
    }

    if (!details) {
      stats.tmdbNotFound++;
    }

    if (context.throttleMs > 0) {
      await sleep(context.throttleMs);
    }
  }

  if (details) {
    const reused = await reuseMovieByTmdbId(context, film, details.id);
    if (reused !== undefined) {
      return reused === 'soft-deleted' ? undefined : reused;
    }
  }

  const englishTitle = details?.title || film.originalTitle || film.title;
  if (!englishTitle) {
    console.log(`  Skipping ${film.imdbId}: no usable title`);
    stats.failed++;
    return undefined;
  }

  const releaseYear = details?.release_date
    ? Number(details.release_date.slice(0, 4))
    : NaN;

  const [movie] = await database
    .insert(movies)
    .values({
      imdbId: film.imdbId,
      tmdbId: details?.id,
      originalLanguage: details?.original_language ?? 'en',
      year: Number.isFinite(releaseYear) ? releaseYear : editionYear,
      releaseDate: details?.release_date || undefined,
    })
    .returning();

  const translationValues: Array<typeof translations.$inferInsert> = [
    {
      resourceType: 'movie_title',
      resourceUid: movie.uid,
      languageCode: 'en',
      content: englishTitle,
    },
  ];

  const japaneseTitle = pickJapaneseTitle({
    title: detailsJa?.title,
    original_title: detailsJa?.original_title,
    original_language:
      details?.original_language ?? detailsJa?.original_language,
  });
  if (japaneseTitle && japaneseTitle !== englishTitle) {
    translationValues.push({
      resourceType: 'movie_title',
      resourceUid: movie.uid,
      languageCode: 'ja',
      content: japaneseTitle,
    });
  }

  await database
    .insert(translations)
    .values(
      withDefaultTranslationFlags(
        details?.original_language ?? 'en',
        translationValues,
      ),
    )
    .onConflictDoNothing();

  await insertImdbAndTmdbReferenceUrls(
    database,
    movie.uid,
    film.imdbId,
    details?.id,
  );

  if (details?.poster_path && context.tmdbApiKey) {
    await insertPoster(
      database,
      movie.uid,
      details.poster_path,
      context.tmdbApiKey,
    );
  }

  console.log(
    `  Created movie: ${englishTitle} (${film.imdbId}${details ? `, TMDb ${details.id}` : ''})`,
  );
  stats.moviesCreated++;
  return movie.uid;
}

async function reuseMovieByTmdbId(
  context: ImportContext,
  film: AwardFilm,
  tmdbId: number,
): Promise<string | 'soft-deleted' | undefined> {
  const {database, stats} = context;
  const [existing] = await database
    .select({
      uid: movies.uid,
      imdbId: movies.imdbId,
      deletedAt: movies.deletedAt,
    })
    .from(movies)
    .where(and(eq(movies.tmdbId, tmdbId), eq(movies.mediaType, 'movie')))
    .limit(1);

  if (!existing) {
    return undefined;
  }

  if (existing.deletedAt !== null) {
    console.log(
      `  Skipping soft-deleted movie (TMDb ${tmdbId}): ${film.imdbId}`,
    );
    stats.skippedSoftDeleted++;
    return 'soft-deleted';
  }

  if (!existing.imdbId) {
    await database
      .update(movies)
      .set({imdbId: film.imdbId})
      .where(eq(movies.uid, existing.uid));
    console.log(`  Set IMDb ID on existing movie (TMDb ${tmdbId})`);
  }

  stats.moviesExisting++;
  return existing.uid;
}

async function insertPoster(
  database: DatabaseClient,
  movieUid: string,
  posterPath: string,
  tmdbApiKey: string,
): Promise<void> {
  let config;
  try {
    config = await fetchTMDBConfig(tmdbApiKey);
  } catch (error) {
    console.error('  Failed to fetch TMDb config:', error);
    return;
  }

  await insertTmdbPosterUrl(database, config, movieUid, posterPath);
}
