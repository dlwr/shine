import {and, eq, getDatabase, sql, type Environment} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {translations} from '@shine/database/schema/translations';
import type {TMDBMovieImages} from '@shine/scrapers/common/tmdb-utilities';

type Database = ReturnType<typeof getDatabase>;

export type TmdbSyncResult = {
  postersAdded: number;
  translationsAdded: number;
};

export async function syncTmdbData(
  database: Database,
  movieUid: string,
  tmdbId: number,
  mediaType: 'movie' | 'tv',
  environment: Environment,
): Promise<TmdbSyncResult> {
  const tmdbApiKey = environment.TMDB_API_KEY;
  if (!tmdbApiKey) {
    throw new Error('TMDb API key not configured');
  }

  const {fetchTMDBMovieTranslations, savePosterUrls} =
    await import('@shine/scrapers/common/tmdb-utilities');

  const result: TmdbSyncResult = {
    postersAdded: 0,
    translationsAdded: 0,
  };

  const imagesUrl = new URL(
    `https://api.themoviedb.org/3/${mediaType}/${tmdbId}/images`,
  );
  imagesUrl.searchParams.append('api_key', tmdbApiKey);

  const imagesResponse = await fetch(imagesUrl.href);
  if (imagesResponse.ok) {
    const images: TMDBMovieImages = await imagesResponse.json();
    if (images.posters && images.posters.length > 0) {
      result.postersAdded = await savePosterUrls(
        movieUid,
        images.posters,
        environment,
      );
    }
  }

  const translationsData = await fetchTMDBMovieTranslations(
    tmdbId,
    tmdbApiKey,
    mediaType,
  );

  const movieResponse = await fetch(
    `https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${tmdbApiKey}`,
  );
  if (!movieResponse.ok) {
    throw new Error(
      `TMDb movie details request failed: ${movieResponse.status}`,
    );
  }

  const movieData: {
    original_language?: string;
    original_title?: string;
    original_name?: string;
  } = await movieResponse.json();
  const originalTitle =
    mediaType === 'tv' ? movieData.original_name : movieData.original_title;

  if (movieData.original_language) {
    await database
      .update(movies)
      .set({
        originalLanguage: movieData.original_language,
      })
      .where(eq(movies.uid, movieUid));
  }

  if (translationsData?.translations) {
    await database
      .update(translations)
      .set({
        isDefault: 0,
      })
      .where(
        and(
          eq(translations.resourceUid, movieUid),
          eq(translations.resourceType, 'movie_title'),
        ),
      );

    let translationsAdded = 0;
    const rowsByLanguage = new Map<string, typeof translations.$inferInsert>();

    if (movieData.original_language === 'ja' && originalTitle) {
      rowsByLanguage.set('ja', {
        resourceType: 'movie_title',
        resourceUid: movieUid,
        languageCode: 'ja',
        content: originalTitle,
        isDefault: 1,
      });
      translationsAdded++;
    }

    for (const translation of translationsData.translations) {
      const translatedTitle = translation.data?.title || translation.data?.name;
      if (translation.iso_639_1 && translatedTitle) {
        const isOriginalLanguage =
          translation.iso_639_1 === movieData.original_language;
        rowsByLanguage.set(translation.iso_639_1, {
          resourceType: 'movie_title',
          resourceUid: movieUid,
          languageCode: translation.iso_639_1,
          content: translatedTitle,
          isDefault: isOriginalLanguage ? 1 : 0,
        });
        translationsAdded++;
      }
    }

    const rows = [...rowsByLanguage.values()];
    const chunkSize = 50;
    const now = Math.floor(Date.now() / 1000);
    for (let index = 0; index < rows.length; index += chunkSize) {
      await database
        .insert(translations)
        .values(rows.slice(index, index + chunkSize))
        .onConflictDoUpdate({
          target: [
            translations.resourceType,
            translations.resourceUid,
            translations.languageCode,
          ],
          set: {
            content: sql`excluded.content`,
            isDefault: sql`excluded.is_default`,
            updatedAt: now,
          },
        });
    }

    result.translationsAdded = translationsAdded;
  }

  return result;
}
