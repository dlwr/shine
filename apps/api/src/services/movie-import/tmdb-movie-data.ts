import {and, eq, type getDatabase, type Environment} from '@shine/database';
import {posterUrls} from '@shine/database/schema/poster-urls';
import {translations} from '@shine/database/schema/translations';
import {
  findTMDBByImdbId,
  normalizeTvData,
  tmdbGet,
  type TMDBMovieData,
  type TMDBTvData,
} from '@shine/scrapers/common/tmdb-client';
import {TmdbConfigError} from '../errors';

type Database = ReturnType<typeof getDatabase>;

export async function fetchTmdbMovieDataByImdbId(
  environment: Environment,
  imdbId: string,
): Promise<
  | {
      tmdbId: number;
      movie: TMDBMovieData;
      mediaType: 'movie' | 'tv';
    }
  | undefined
> {
  const apiKey = environment.TMDB_API_KEY;
  if (!apiKey) {
    throw new TmdbConfigError();
  }

  const findResult = await findTMDBByImdbId(imdbId, apiKey);
  if (!findResult) {
    return undefined;
  }

  const {tmdbId, mediaType} = findResult;

  if (mediaType === 'tv') {
    const tvData = await tmdbGet<
      TMDBTvData & {translations?: TMDBMovieData['translations']}
    >(`tv/${tmdbId}`, apiKey, {append_to_response: 'translations'});
    return {tmdbId, mediaType, movie: normalizeTvData(tvData)};
  }

  const movieData = await tmdbGet<TMDBMovieData>(`movie/${tmdbId}`, apiKey, {
    append_to_response: 'translations',
  });

  return {tmdbId, mediaType, movie: movieData};
}

export async function addPosterFromTmdb(
  database: Database,
  movieId: string,
  tmdbData: TMDBMovieData,
): Promise<number> {
  if (!tmdbData.poster_path) {
    return 0;
  }

  const url = `https://image.tmdb.org/t/p/w500${tmdbData.poster_path}`;

  // Check if this poster already exists
  const existingPoster = await database
    .select({uid: posterUrls.uid})
    .from(posterUrls)
    .where(and(eq(posterUrls.movieUid, movieId), eq(posterUrls.url, url)))
    .limit(1);

  if (existingPoster.length > 0) {
    return 0;
  }

  await database.insert(posterUrls).values({
    movieUid: movieId,
    url,
    width: 500,
    height: 750,
    languageCode: 'en',
    sourceType: 'tmdb',
    isPrimary: 0,
    createdAt: Math.floor(Date.now() / 1000),
  });

  return 1;
}

export async function addTranslationsFromTmdb(
  database: Database,
  movieId: string,
  tmdbData: TMDBMovieData,
): Promise<number> {
  const tmdbTranslations = tmdbData.translations?.translations ?? [];
  if (tmdbTranslations.length === 0) {
    return 0;
  }

  const now = Math.floor(Date.now() / 1000);
  let addedCount = 0;

  await database
    .update(translations)
    .set({
      isDefault: 0,
    })
    .where(
      and(
        eq(translations.resourceUid, movieId),
        eq(translations.resourceType, 'movie_title'),
      ),
    );

  if (tmdbData.original_language === 'ja' && tmdbData.original_title) {
    const existingJapaneseTranslation = await database
      .select({uid: translations.uid})
      .from(translations)
      .where(
        and(
          eq(translations.resourceUid, movieId),
          eq(translations.resourceType, 'movie_title'),
          eq(translations.languageCode, 'ja'),
        ),
      )
      .limit(1);

    if (existingJapaneseTranslation.length === 0) {
      await database.insert(translations).values({
        resourceType: 'movie_title',
        resourceUid: movieId,
        languageCode: 'ja',
        content: tmdbData.original_title,
        isDefault: 1,
        createdAt: now,
      });
      addedCount++;
    }
  }

  for (const translation of tmdbTranslations) {
    const languageCode = translation.iso_639_1;
    const title = translation.data?.title || translation.data?.name;

    if (!languageCode || !title) {
      continue;
    }

    const translationQuery = and(
      eq(translations.resourceUid, movieId),
      eq(translations.resourceType, 'movie_title'),
      eq(translations.languageCode, languageCode),
    );

    const existingTranslation = await database
      .select({uid: translations.uid})
      .from(translations)
      .where(translationQuery)
      .limit(1);

    const isOriginalLanguage = languageCode === tmdbData.original_language;

    if (existingTranslation.length === 0) {
      await database.insert(translations).values({
        resourceType: 'movie_title',
        resourceUid: movieId,
        languageCode,
        content: title,
        isDefault: isOriginalLanguage ? 1 : 0,
        createdAt: now,
      });
      addedCount++;
      continue;
    }

    if (!isOriginalLanguage) {
      continue;
    }

    await database
      .update(translations)
      .set({
        isDefault: 1,
      })
      .where(translationQuery);
  }

  return addedCount;
}
