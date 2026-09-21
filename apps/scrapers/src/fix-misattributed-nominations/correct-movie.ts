import {and, eq, isNull} from 'drizzle-orm';
import {type Environment} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {referenceUrls} from '@shine/database/schema/reference-urls';
import {translations} from '@shine/database/schema/translations';
import {savePosterUrls} from '@shine/tmdb/persistence';
import {
  fetchTMDBImages,
  fetchTMDBMovieDetails,
  findTMDBByImdbId,
  type TMDBMovieData,
} from '@shine/tmdb';
import {withDefaultTranslationFlags} from '../common/default-translations';
import {
  type Database,
  type FixMisattributedStats,
  type MisattributedNomination,
} from './types';

const CJK_PATTERN = /[぀-ヿ一-鿿]/;

async function findMovieByImdbId(
  database: Database,
  imdbId: string,
): Promise<{uid: string; deletedAt: number | null} | undefined> {
  const [row] = await database
    .select({uid: movies.uid, deletedAt: movies.deletedAt})
    .from(movies)
    .where(eq(movies.imdbId, imdbId));
  return row;
}

async function findMovieByTitleAndYear(
  database: Database,
  title: string,
  year: number,
): Promise<string | undefined> {
  const [row] = await database
    .select({uid: movies.uid})
    .from(movies)
    .innerJoin(translations, eq(translations.resourceUid, movies.uid))
    .where(
      and(
        isNull(movies.deletedAt),
        eq(movies.year, year),
        eq(translations.resourceType, 'movie_title'),
        eq(translations.content, title),
      ),
    );
  return row?.uid;
}

async function createMovie(
  database: Database,
  environment: Environment,
  entry: MisattributedNomination,
  details: TMDBMovieData | undefined,
): Promise<string> {
  const [movie] = await database
    .insert(movies)
    .values({
      imdbId: entry.correctImdbId,
      tmdbId: details?.id,
      originalLanguage: details?.original_language ?? 'ja',
      year: entry.correctYear,
      releaseDate: details?.release_date || undefined,
    })
    .returning();

  const titleValues: Array<typeof translations.$inferInsert> = [
    {
      resourceType: 'movie_title',
      resourceUid: movie.uid,
      languageCode: 'en',
      content: details?.title ?? entry.correctTitle,
    },
  ];

  if (CJK_PATTERN.test(entry.correctTitle)) {
    titleValues.push({
      resourceType: 'movie_title',
      resourceUid: movie.uid,
      languageCode: 'ja',
      content: entry.correctTitle,
    });
  }

  await database
    .insert(translations)
    .values(
      withDefaultTranslationFlags(
        details?.original_language ?? 'ja',
        titleValues,
      ),
    )
    .onConflictDoNothing();

  if (entry.correctImdbId) {
    await database
      .insert(referenceUrls)
      .values({
        movieUid: movie.uid,
        url: `https://www.imdb.com/title/${entry.correctImdbId}/`,
        sourceType: 'imdb',
        languageCode: 'en',
        isPrimary: 1,
      })
      .onConflictDoNothing();
  }

  if (details?.id) {
    await database
      .insert(referenceUrls)
      .values({
        movieUid: movie.uid,
        url: `https://www.themoviedb.org/movie/${details.id}`,
        sourceType: 'other',
        languageCode: 'en',
        description: 'TMDb entry',
        isPrimary: 0,
      })
      .onConflictDoNothing();
  }

  if (details?.id && environment.TMDB_API_KEY) {
    try {
      const images = await fetchTMDBImages(
        details.id,
        'movie',
        environment.TMDB_API_KEY,
      );

      if (images) {
        await savePosterUrls(movie.uid, images.posters, environment);
      }
    } catch (error) {
      console.error(`ポスターの取得に失敗しました: TMDb ${details.id}`, error);
    }
  }

  return movie.uid;
}

export async function resolveCorrectMovie(
  database: Database,
  environment: Environment,
  entry: MisattributedNomination,
  stats: FixMisattributedStats,
): Promise<string> {
  if (entry.correctImdbId) {
    const existing = await findMovieByImdbId(database, entry.correctImdbId);

    if (existing) {
      if (existing.deletedAt !== null) {
        await database
          .update(movies)
          .set({deletedAt: null})
          .where(eq(movies.uid, existing.uid));
        stats.moviesRevived++;
      }

      return existing.uid;
    }
  } else {
    const existing = await findMovieByTitleAndYear(
      database,
      entry.correctTitle,
      entry.correctYear,
    );

    if (existing) {
      return existing;
    }
  }

  const tmdbApiKey = environment.TMDB_API_KEY;
  let details: TMDBMovieData | undefined;
  if (tmdbApiKey && entry.correctImdbId) {
    const found = await findTMDBByImdbId(entry.correctImdbId, tmdbApiKey);
    if (found?.mediaType === 'movie') {
      details = await fetchTMDBMovieDetails(found.tmdbId, tmdbApiKey, 'en-US');
    }
  }

  const uid = await createMovie(database, environment, entry, details);
  stats.moviesCreated++;
  return uid;
}
