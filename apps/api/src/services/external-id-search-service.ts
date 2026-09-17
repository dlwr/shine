import {and, eq, isNull} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {translations} from '@shine/database/schema/translations';
import {fetchTMDBExternalIds, searchTMDBMovies} from '@shine/tmdb';
import {BaseService} from './base-service';
import {NotFoundError, TmdbConfigError, ValidationError} from './errors';

export class ExternalIdSearchService extends BaseService {
  async searchExternalMovieIds(
    movieId: string,
    options: {
      query?: string;
      language?: string;
      year?: number;
      limit?: number;
    } = {},
  ): Promise<{
    usedQuery: string;
    usedYear?: number;
    results: Array<{
      tmdbId: number;
      imdbId?: string;
      title: string;
      originalTitle?: string;
      releaseDate?: string;
      overview?: string;
      originalLanguage?: string;
      posterPath?: string;
      popularity?: number;
      voteAverage?: number;
      voteCount?: number;
      yearDifference?: number;
    }>;
  }> {
    const tmdbApiKey = this.env.TMDB_API_KEY;

    if (!tmdbApiKey) {
      throw new TmdbConfigError();
    }

    const [movie] = await this.database
      .select({
        uid: movies.uid,
        year: movies.year,
      })
      .from(movies)
      .where(and(eq(movies.uid, movieId), isNull(movies.deletedAt)))
      .limit(1);

    if (!movie) {
      throw new NotFoundError('Movie not found');
    }

    const translationsForMovie = await this.database
      .select({
        languageCode: translations.languageCode,
        content: translations.content,
      })
      .from(translations)
      .where(
        and(
          eq(translations.resourceUid, movieId),
          eq(translations.resourceType, 'movie_title'),
        ),
      );

    const sanitizedQuery = options.query?.trim();

    const preferredTranslation = (() => {
      if (sanitizedQuery) {
        return translationsForMovie.find(
          translation => translation.content === sanitizedQuery,
        );
      }

      return (
        translationsForMovie.find(t => t.languageCode === 'ja') ??
        translationsForMovie.find(t => t.languageCode === 'en') ??
        translationsForMovie[0]
      );
    })();

    const query = sanitizedQuery || preferredTranslation?.content?.trim();

    if (!query) {
      throw new ValidationError('Search query is required');
    }

    const searchLanguage = (() => {
      if (options.language) {
        return options.language;
      }

      if (preferredTranslation?.languageCode === 'ja') {
        return 'ja-JP';
      }

      if (preferredTranslation?.languageCode === 'en') {
        return 'en-US';
      }

      return 'en-US';
    })();

    const yearToUse =
      options.year !== undefined && !Number.isNaN(options.year)
        ? options.year
        : (movie.year ?? undefined);

    const limit = Math.min(Math.max(options.limit ?? 5, 1), 10);

    let searchResults;
    try {
      searchResults = await searchTMDBMovies(tmdbApiKey, {
        query,
        include_adult: 'false',
        language: searchLanguage,
        ...(yearToUse && {year: String(yearToUse)}),
      });
    } catch {
      throw new Error('Failed to search TMDb');
    }

    const limitedResults = searchResults.slice(0, limit);

    const results = await Promise.all(
      limitedResults.map(async item => {
        let imdbId: string | undefined;

        try {
          const externalData = await fetchTMDBExternalIds(item.id, tmdbApiKey);
          imdbId = externalData.imdb_id ?? undefined;
        } catch (error) {
          console.warn(
            `Failed to fetch external IDs for TMDb movie ${item.id}:`,
            error,
          );
        }

        const releaseYear = item.release_date
          ? Number(item.release_date.slice(0, 4))
          : undefined;

        const yearDifference =
          releaseYear !== undefined &&
          movie.year !== null &&
          movie.year !== undefined
            ? Math.abs(releaseYear - movie.year)
            : undefined;

        return {
          tmdbId: item.id,
          imdbId,
          title: item.title,
          originalTitle: item.original_title,
          releaseDate: item.release_date,
          overview: item.overview || undefined,
          originalLanguage: item.original_language,
          posterPath: item.poster_path,
          popularity: item.popularity,
          voteAverage: item.vote_average,
          voteCount: item.vote_count,
          yearDifference,
        };
      }),
    );

    return {
      usedQuery: query,
      usedYear: yearToUse,
      results,
    };
  }
}
