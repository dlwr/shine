import {and, eq, isNull, not} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {posterUrls} from '@shine/database/schema/poster-urls';
import {translations} from '@shine/database/schema/translations';
import type {
  TMDBMovieData,
  TMDBTvData,
} from '@shine/scrapers/common/tmdb-utilities';
import {BaseService} from './base-service';
import {
  ConflictError,
  NotFoundError,
  TmdbConfigError,
  TmdbDataNotFoundError,
  ValidationError,
} from './errors';
import type {UpdateIMDBIdOptions} from '@shine/types';

export class MovieImportService extends BaseService {
  async createMovieFromImdbId(
    imdbId: string,
    options: {fetchTMDBData?: boolean} = {},
  ): Promise<{
    movie: typeof movies.$inferSelect;
    tmdbId?: number;
    postersAdded: number;
    translationsAdded: number;
  }> {
    const normalizedImdbId = imdbId.trim();

    if (!normalizedImdbId) {
      throw new ValidationError('IMDb ID is required');
    }

    if (!/^tt\d+$/.test(normalizedImdbId)) {
      throw new ValidationError("IMDB ID must be in format 'tt1234567'");
    }

    const existingMovie = await this.database
      .select({uid: movies.uid})
      .from(movies)
      .where(eq(movies.imdbId, normalizedImdbId))
      .limit(1);

    if (existingMovie.length > 0) {
      throw new ConflictError('IMDB ID is already used by another movie');
    }

    const {fetchTMDBData = true} = options;

    let tmdbMovieId: number | undefined;
    let tmdbMovieData: TMDBMovieData | undefined;
    let detectedMediaType: 'movie' | 'tv' = 'movie';

    if (fetchTMDBData) {
      const tmdbData = await this.fetchTMDBDataByImdbId(normalizedImdbId);

      if (!tmdbData) {
        throw new TmdbDataNotFoundError(
          'Could not find TMDB data for that IMDb ID',
        );
      }

      tmdbMovieId = tmdbData.tmdbId;
      tmdbMovieData = tmdbData.movie;
      detectedMediaType = tmdbData.mediaType;

      if (tmdbMovieId !== undefined) {
        const existingByTmdb = await this.database
          .select({uid: movies.uid})
          .from(movies)
          .where(
            and(
              eq(movies.tmdbId, tmdbMovieId),
              eq(movies.mediaType, detectedMediaType),
            ),
          )
          .limit(1);

        if (existingByTmdb.length > 0) {
          throw new ConflictError('TMDB ID is already used by another movie');
        }
      }
    }

    let releaseYear: number | undefined;
    if (tmdbMovieData?.release_date) {
      const parsedYear = Number(tmdbMovieData.release_date.slice(0, 4));
      if (!Number.isNaN(parsedYear)) {
        releaseYear = parsedYear;
      }
    }

    const movieValues: typeof movies.$inferInsert = {
      imdbId: normalizedImdbId,
    };

    if (tmdbMovieData?.original_language) {
      movieValues.originalLanguage = tmdbMovieData.original_language;
    }

    if (releaseYear !== undefined) {
      movieValues.year = releaseYear;
    }

    if (tmdbMovieId !== undefined) {
      movieValues.tmdbId = tmdbMovieId;
    }

    movieValues.mediaType = detectedMediaType;

    const [newMovie] = await this.database
      .insert(movies)
      .values(movieValues)
      .returning();

    if (!newMovie) {
      throw new Error('Failed to create movie');
    }

    let postersAdded = 0;
    let translationsAdded = 0;

    if (fetchTMDBData && this.env.TMDB_API_KEY) {
      try {
        const {fetchTMDBMovieImages, savePosterUrls} =
          await import('@shine/scrapers/common/tmdb-utilities');

        const imagesResult = await fetchTMDBMovieImages(
          normalizedImdbId,
          this.env.TMDB_API_KEY,
        );

        if (imagesResult?.images?.posters?.length) {
          const saved = await savePosterUrls(
            newMovie.uid,
            imagesResult.images.posters,
            this.env,
          );
          postersAdded += saved;
        }

        if (!tmdbMovieId && imagesResult?.tmdbId) {
          tmdbMovieId = imagesResult.tmdbId;
          await this.database
            .update(movies)
            .set({
              tmdbId: tmdbMovieId,
            })
            .where(eq(movies.uid, newMovie.uid));
        }
      } catch (error) {
        console.error('Failed to save TMDB posters:', error);
      }
    }

    if (tmdbMovieData) {
      if (postersAdded === 0) {
        postersAdded = await this.addPostersFromTMDB(
          newMovie.uid,
          tmdbMovieData,
        );
      }

      translationsAdded = await this.addTranslationsFromTMDB(
        newMovie.uid,
        tmdbMovieData,
      );
    }

    const tmdbIdValue = newMovie.tmdbId ?? tmdbMovieId;
    const yearValue = newMovie.year ?? releaseYear;

    const movieDetails = {
      ...newMovie,
      imdbId: newMovie.imdbId ?? normalizedImdbId,
    };

    if (tmdbIdValue === undefined) {
      // Keep existing value from database when new data is unavailable
    } else {
      movieDetails.tmdbId = tmdbIdValue;
    }

    if (yearValue === undefined) {
      // Preserve existing year if we cannot determine a better value
    } else {
      movieDetails.year = yearValue;
    }

    return {
      movie: movieDetails,
      tmdbId: tmdbMovieId,
      postersAdded,
      translationsAdded,
    };
  }

  async updateIMDbId(
    movieId: string,
    options: UpdateIMDBIdOptions,
  ): Promise<{
    tmdbId?: number;
    postersAdded: number;
    translationsAdded: number;
  }> {
    const {imdbId, fetchTMDBData = false} = options;

    // Validate IMDb ID format (can be empty for removal)
    if (imdbId && !/^tt\d+$/.test(imdbId)) {
      throw new ValidationError("IMDB ID must be in format 'tt1234567'");
    }

    // Check if movie exists
    const movieExists = await this.database
      .select({uid: movies.uid})
      .from(movies)
      .where(and(eq(movies.uid, movieId), isNull(movies.deletedAt)))
      .limit(1);

    if (movieExists.length === 0) {
      throw new NotFoundError('Movie not found');
    }

    // Check for duplicate IMDb ID if setting one
    if (imdbId) {
      const existingMovie = await this.database
        .select({uid: movies.uid})
        .from(movies)
        .where(and(eq(movies.imdbId, imdbId), not(eq(movies.uid, movieId))))
        .limit(1);

      if (existingMovie.length > 0) {
        throw new ConflictError('IMDB ID is already used by another movie');
      }
    }

    let tmdbId: number | undefined;
    let postersAdded = 0;
    let translationsAdded = 0;
    let detectedMediaType: 'movie' | 'tv' | undefined;

    if (fetchTMDBData) {
      try {
        const tmdbData = await this.fetchTMDBDataByImdbId(imdbId);
        if (tmdbData) {
          tmdbId = tmdbData.tmdbId;
          detectedMediaType = tmdbData.mediaType;
          postersAdded = await this.addPostersFromTMDB(movieId, tmdbData.movie);
          translationsAdded = await this.addTranslationsFromTMDB(
            movieId,
            tmdbData.movie,
          );

          // Update originalLanguage if available
          if (tmdbData.movie.original_language) {
            await this.database
              .update(movies)
              .set({
                originalLanguage: tmdbData.movie.original_language,
              })
              .where(eq(movies.uid, movieId));
          }
        }
      } catch (error) {
        console.error('Failed to fetch TMDB data:', error);
      }
    }

    await this.database
      .update(movies)
      .set({
        imdbId,
        ...(tmdbId && {tmdbId}),
        ...(detectedMediaType && {mediaType: detectedMediaType}),
      })
      .where(eq(movies.uid, movieId));

    return {tmdbId, postersAdded, translationsAdded};
  }

  private async fetchTMDBDataByImdbId(imdbId: string): Promise<
    | {
        tmdbId: number;
        movie: TMDBMovieData;
        mediaType: 'movie' | 'tv';
      }
    | undefined
  > {
    const apiKey = this.env.TMDB_API_KEY;
    if (!apiKey) {
      throw new TmdbConfigError();
    }

    const {findTMDBByImdbId} =
      await import('@shine/scrapers/common/tmdb-utilities');
    const findResult = await findTMDBByImdbId(imdbId, apiKey);
    if (!findResult) {
      return undefined;
    }

    const {tmdbId, mediaType} = findResult;

    // Get detailed data with translations (append_to_response not available via fetchTMDBDetails)
    const movieResponse = await fetch(
      `https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${apiKey}&append_to_response=translations`,
    );

    if (!movieResponse.ok) {
      throw new Error(`TMDB API error: ${movieResponse.statusText}`);
    }

    if (mediaType === 'tv') {
      const tvData: TMDBTvData & {
        translations?: TMDBMovieData['translations'];
      } = await movieResponse.json();
      return {
        tmdbId,
        mediaType,
        movie: {
          id: tvData.id,
          title: tvData.name,
          original_title: tvData.original_name,
          original_language: tvData.original_language,
          release_date: tvData.first_air_date,
          poster_path: tvData.poster_path,
          translations: tvData.translations,
        },
      };
    }

    const movieData: TMDBMovieData = await movieResponse.json();

    return {
      tmdbId,
      mediaType,
      movie: movieData,
    };
  }

  private async addPostersFromTMDB(
    movieId: string,
    tmdbData: TMDBMovieData,
  ): Promise<number> {
    if (!tmdbData.poster_path) {
      return 0;
    }

    const url = `https://image.tmdb.org/t/p/w500${tmdbData.poster_path}`;

    // Check if this poster already exists
    const existingPoster = await this.database
      .select({uid: posterUrls.uid})
      .from(posterUrls)
      .where(and(eq(posterUrls.movieUid, movieId), eq(posterUrls.url, url)))
      .limit(1);

    if (existingPoster.length > 0) {
      return 0;
    }

    await this.database.insert(posterUrls).values({
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

  private async addTranslationsFromTMDB(
    movieId: string,
    tmdbData: TMDBMovieData,
  ): Promise<number> {
    const tmdbTranslations = tmdbData.translations?.translations ?? [];
    if (tmdbTranslations.length === 0) {
      return 0;
    }

    const now = Math.floor(Date.now() / 1000);
    let addedCount = 0;

    await this.database
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
      const existingJapaneseTranslation = await this.database
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
        await this.database.insert(translations).values({
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

      const existingTranslation = await this.database
        .select({uid: translations.uid})
        .from(translations)
        .where(translationQuery)
        .limit(1);

      const isOriginalLanguage = languageCode === tmdbData.original_language;

      if (existingTranslation.length === 0) {
        await this.database.insert(translations).values({
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

      await this.database
        .update(translations)
        .set({
          isDefault: 1,
        })
        .where(translationQuery);
    }

    return addedCount;
  }
}
