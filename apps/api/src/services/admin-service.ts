import {and, eq, not, sql} from '@shine/database';
import {articleLinks} from '@shine/database/schema/article-links';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movieAvailabilityChecks} from '@shine/database/schema/movie-availability-checks';
import {movieSelections} from '@shine/database/schema/movie-selections';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {posterUrls} from '@shine/database/schema/poster-urls';
import {referenceUrls} from '@shine/database/schema/reference-urls';
import {translations} from '@shine/database/schema/translations';
import type {
  TMDBMovieData,
  TMDBTvData,
} from '@shine/scrapers/common/tmdb-utilities';
import puppeteer from '@cloudflare/puppeteer';
import {BaseService} from './base-service';
import {
  ConflictError,
  ExternalFetchError,
  NotFoundError,
  TmdbConfigError,
  TmdbDataNotFoundError,
  UnprocessableContentError,
  ValidationError,
} from './errors';
import {
  type ImdbNextData,
  extractImdbNominations,
  normalizeCategoryName,
} from './imdb-matching';
import type {
  MergeMoviesOptions,
  PaginationOptions,
  UpdateIMDBIdOptions,
} from '@shine/types';

const AWARD_SYNONYM_GROUPS: string[][] = [
  [
    "palme d'or",
    'grand prize of the festival',
    'grand prix du festival',
    'golden palm',
  ].map(s => normalizeCategoryName(s)),
  ['grand prix', 'grand prize of the jury', 'grand prize'].map(s =>
    normalizeCategoryName(s),
  ),
];

const ensureTrailingSlash = (value: string): string =>
  value.endsWith('/') ? value : `${value}/`;

function titleSubquery(languageCode?: string) {
  const languageFilter = languageCode
    ? sql`AND translations.language_code = ${languageCode}`
    : sql``;

  return sql`
		(
			SELECT content
			FROM translations
			WHERE translations.resource_uid = movies.uid
			AND translations.resource_type = 'movie_title'
			${languageFilter}
			LIMIT 1
		)
	`;
}

export class AdminService extends BaseService {
  async getMovies(options: PaginationOptions & {search?: string}) {
    const {page, limit, search} = options;
    const offset = (page - 1) * limit;

    const titleSql = sql`
			COALESCE(
				${titleSubquery('ja')},
				${titleSubquery('en')},
				${titleSubquery()},
				'Untitled'
			)
		`.as('title');

    const posterUrlSql = sql`
			(
				SELECT url
				FROM poster_urls
				WHERE poster_urls.movie_uid = movies.uid
				LIMIT 1
			)
		`.as('posterUrl');

    const nominationCountSql = sql`
			(
				SELECT COUNT(*)
				FROM nominations
				WHERE nominations.movie_uid = movies.uid
			)
		`.as('nominationCount');

    const searchCondition = search
      ? sql`
				EXISTS (
					SELECT 1 FROM translations
					WHERE translations.resource_uid = movies.uid
					AND translations.resource_type = 'movie_title'
					AND translations.content LIKE ${`%${search}%`}
				)
			`
      : undefined;

    const allMovies = await this.database
      .select({
        uid: movies.uid,
        year: movies.year,
        originalLanguage: movies.originalLanguage,
        imdbId: movies.imdbId,
        mediaType: movies.mediaType,
        title: titleSql,
        posterUrl: posterUrlSql,
        nominationCount: nominationCountSql,
      })
      .from(movies)
      .where(searchCondition)
      .orderBy(sql`${movies.createdAt} DESC`)
      .limit(limit)
      .offset(offset);

    const totalCountResult = await this.database
      .select({count: sql`COUNT(*)`.as('count')})
      .from(movies)
      .where(searchCondition);

    const totalCount = Number(totalCountResult[0]?.count) || 0;
    const totalPages = Math.ceil(totalCount / limit);

    return {
      movies: allMovies,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

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
          .where(eq(movies.tmdbId, tmdbMovieId))
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

  async deleteMovie(movieId: string): Promise<void> {
    await this.database.transaction(async trx => {
      await trx.delete(articleLinks).where(eq(articleLinks.movieUid, movieId));
      await trx
        .delete(movieAvailabilityChecks)
        .where(eq(movieAvailabilityChecks.movieUid, movieId));
      await trx
        .delete(movieSelections)
        .where(eq(movieSelections.movieId, movieId));
      await trx.delete(nominations).where(eq(nominations.movieUid, movieId));
      await trx
        .delete(referenceUrls)
        .where(eq(referenceUrls.movieUid, movieId));
      await trx
        .delete(translations)
        .where(eq(translations.resourceUid, movieId));
      await trx.delete(posterUrls).where(eq(posterUrls.movieUid, movieId));
      await trx.delete(movies).where(eq(movies.uid, movieId));
    });
  }

  async getMovieForAdmin(movieId: string) {
    // Get basic movie info
    const movieResult = await this.database
      .select({
        uid: movies.uid,
        year: movies.year,
        originalLanguage: movies.originalLanguage,
        imdbId: movies.imdbId,
        tmdbId: movies.tmdbId,
        mediaType: movies.mediaType,
      })
      .from(movies)
      .where(eq(movies.uid, movieId))
      .limit(1);

    if (movieResult.length === 0) {
      throw new NotFoundError('Movie not found');
    }

    const movie = movieResult[0];

    // Get all translations
    const translationsResult = await this.database
      .select({
        uid: translations.uid,
        languageCode: translations.languageCode,
        content: translations.content,
        isDefault: translations.isDefault,
      })
      .from(translations)
      .where(
        and(
          eq(translations.resourceUid, movieId),
          eq(translations.resourceType, 'movie_title'),
        ),
      )
      .orderBy(translations.languageCode);

    // Get all posters
    const postersResult = await this.database
      .select({
        uid: posterUrls.uid,
        url: posterUrls.url,
        width: posterUrls.width,
        height: posterUrls.height,
        languageCode: posterUrls.languageCode,
        sourceType: posterUrls.sourceType,
        isPrimary: posterUrls.isPrimary,
      })
      .from(posterUrls)
      .where(eq(posterUrls.movieUid, movieId))
      .orderBy(posterUrls.isPrimary, posterUrls.createdAt);

    // Get nominations with full details
    const nominationsResult = await this.database
      .select({
        uid: nominations.uid,
        isWinner: nominations.isWinner,
        specialMention: nominations.specialMention,
        categoryUid: awardCategories.uid,
        categoryName: awardCategories.name,
        ceremonyUid: awardCeremonies.uid,
        ceremonyNumber: awardCeremonies.ceremonyNumber,
        ceremonyYear: awardCeremonies.year,
        organizationUid: awardOrganizations.uid,
        organizationName: awardOrganizations.name,
        organizationShortName: awardOrganizations.shortName,
      })
      .from(nominations)
      .innerJoin(
        awardCategories,
        eq(awardCategories.uid, nominations.categoryUid),
      )
      .innerJoin(
        awardCeremonies,
        eq(awardCeremonies.uid, nominations.ceremonyUid),
      )
      .innerJoin(
        awardOrganizations,
        eq(awardOrganizations.uid, awardCeremonies.organizationUid),
      )
      .where(eq(nominations.movieUid, movieId))
      .orderBy(awardCeremonies.year, awardCategories.name);

    // Get article links
    const articleLinksResult = await this.database
      .select({
        uid: articleLinks.uid,
        url: articleLinks.url,
        title: articleLinks.title,
        description: articleLinks.description,
        isSpam: articleLinks.isSpam,
      })
      .from(articleLinks)
      .where(eq(articleLinks.movieUid, movieId))
      .orderBy(sql`${articleLinks.submittedAt} DESC`);

    return {
      uid: movie.uid,
      year: movie.year,
      originalLanguage: movie.originalLanguage,
      imdbId: movie.imdbId,
      tmdbId: movie.tmdbId,
      translations: translationsResult,
      posters: postersResult,
      nominations: nominationsResult.map(nom => ({
        uid: nom.uid,
        isWinner: Boolean(nom.isWinner),
        specialMention: nom.specialMention,
        category: {
          uid: nom.categoryUid,
          name: nom.categoryName,
        },
        ceremony: {
          uid: nom.ceremonyUid,
          number: nom.ceremonyNumber!,
          year: nom.ceremonyYear,
        },
        organization: {
          uid: nom.organizationUid,
          name: nom.organizationName,
          shortName: nom.organizationShortName!,
        },
      })),
      articleLinks: articleLinksResult,
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
      .where(eq(movies.uid, movieId))
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
      .where(eq(movies.uid, movieId))
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

    const searchUrl = new URL('https://api.themoviedb.org/3/search/movie');
    searchUrl.searchParams.append('api_key', tmdbApiKey);
    searchUrl.searchParams.append('query', query);
    searchUrl.searchParams.append('include_adult', 'false');
    searchUrl.searchParams.append('language', searchLanguage);

    if (yearToUse) {
      searchUrl.searchParams.append('year', String(yearToUse));
    }

    const searchResponse = await fetch(searchUrl.href);

    if (!searchResponse.ok) {
      throw new Error('Failed to search TMDb');
    }

    type TMDBSearchResult = {
      id: number;
      title: string;
      original_title?: string;
      overview?: string;
      release_date?: string;
      original_language?: string;
      popularity?: number;
      vote_average?: number;
      vote_count?: number;
      poster_path?: string;
    };

    const searchData = (await searchResponse.json()) as {
      results: TMDBSearchResult[];
    };

    const limitedResults = searchData.results.slice(0, limit);

    const results = await Promise.all(
      limitedResults.map(async item => {
        let imdbId: string | undefined;

        try {
          const externalUrl = new URL(
            `https://api.themoviedb.org/3/movie/${item.id}/external_ids`,
          );
          externalUrl.searchParams.append('api_key', tmdbApiKey);

          const externalResponse = await fetch(externalUrl.href);
          if (externalResponse.ok) {
            const externalData = (await externalResponse.json()) as {
              imdb_id?: string;
            };

            imdbId = externalData.imdb_id ?? undefined;
          }
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

  async addPoster(
    movieId: string,
    posterData: {
      url: string;
      width?: number;
      height?: number;
      language?: string;
      source?: string;
      isPrimary?: boolean;
    },
  ) {
    const {
      url,
      width,
      height,
      language = 'en',
      source = 'manual',
      isPrimary = false,
    } = posterData;

    if (isPrimary) {
      await this.database
        .update(posterUrls)
        .set({isPrimary: 0})
        .where(eq(posterUrls.movieUid, movieId));
    }

    const [newPoster] = await this.database
      .insert(posterUrls)
      .values({
        movieUid: movieId,
        url,
        width,
        height,
        languageCode: language,
        sourceType: source,
        isPrimary: isPrimary ? 1 : 0,
        createdAt: Math.floor(Date.now() / 1000),
      })
      .returning();

    return newPoster;
  }

  async deletePoster(movieId: string, posterId: string): Promise<void> {
    await this.database
      .delete(posterUrls)
      .where(
        and(eq(posterUrls.uid, posterId), eq(posterUrls.movieUid, movieId)),
      );
  }

  async flagArticleAsSpam(articleId: string): Promise<string | undefined> {
    const updated = await this.database
      .update(articleLinks)
      .set({isSpam: true})
      .where(eq(articleLinks.uid, articleId))
      .returning({movieUid: articleLinks.movieUid});
    return updated[0]?.movieUid;
  }

  async deleteArticleLink(articleId: string): Promise<string | undefined> {
    const deleted = await this.database
      .delete(articleLinks)
      .where(eq(articleLinks.uid, articleId))
      .returning({movieUid: articleLinks.movieUid});
    return deleted[0]?.movieUid;
  }

  async mergeMovies(options: MergeMoviesOptions): Promise<void> {
    const {
      sourceMovieId,
      targetMovieId,
      preserveTranslations = true,
      preservePosters = true,
    } = options;

    if (sourceMovieId === targetMovieId) {
      throw new Error('Cannot merge a movie with itself');
    }

    await this.database.transaction(async trx => {
      // Merge nominations
      await trx
        .update(nominations)
        .set({
          movieUid: targetMovieId,
        })
        .where(eq(nominations.movieUid, sourceMovieId));

      // Merge movie selections
      await trx
        .update(movieSelections)
        .set({
          movieId: targetMovieId,
        })
        .where(eq(movieSelections.movieId, sourceMovieId));

      // Merge article links
      await trx
        .update(articleLinks)
        .set({movieUid: targetMovieId})
        .where(eq(articleLinks.movieUid, sourceMovieId));

      // Merge reference URLs
      await trx
        .update(referenceUrls)
        .set({
          movieUid: targetMovieId,
        })
        .where(eq(referenceUrls.movieUid, sourceMovieId));

      // Update or delete translations based on preserveTranslations flag
      void (preserveTranslations
        ? await trx
            .update(translations)
            .set({
              resourceUid: targetMovieId,
            })
            .where(eq(translations.resourceUid, sourceMovieId))
        : await trx
            .delete(translations)
            .where(eq(translations.resourceUid, sourceMovieId)));

      // Update or delete posters based on preservePosters flag
      void (preservePosters
        ? await trx
            .update(posterUrls)
            .set({
              movieUid: targetMovieId,
            })
            .where(eq(posterUrls.movieUid, sourceMovieId))
        : await trx
            .delete(posterUrls)
            .where(eq(posterUrls.movieUid, sourceMovieId)));

      // Delete the source movie
      await trx.delete(movies).where(eq(movies.uid, sourceMovieId));
    });
  }

  async syncCeremonyNominationsFromImdb(
    ceremonyUid: string,
    options: {categoryUid: string},
  ): Promise<{
    moviesCreated: number;
    nominationsInserted: number;
    skipped: number;
    imdbEntries: number;
    categoryName: string;
  }> {
    const trimmedCategoryUid = options.categoryUid?.trim();

    if (!trimmedCategoryUid) {
      throw new ValidationError('Category UID is required');
    }

    const ceremonyRows = await this.database
      .select({
        uid: awardCeremonies.uid,
        organizationUid: awardCeremonies.organizationUid,
        imdbEventUrl: awardCeremonies.imdbEventUrl,
      })
      .from(awardCeremonies)
      .where(eq(awardCeremonies.uid, ceremonyUid))
      .limit(1);

    const ceremony = ceremonyRows[0];
    if (!ceremony) {
      throw new NotFoundError('Ceremony not found');
    }

    const imdbEventUrl = ceremony.imdbEventUrl?.trim();
    if (!imdbEventUrl) {
      throw new ValidationError(
        'Ceremony does not have an IMDb event URL configured',
      );
    }

    const categoryRows = await this.database
      .select({
        uid: awardCategories.uid,
        organizationUid: awardCategories.organizationUid,
        name: awardCategories.name,
      })
      .from(awardCategories)
      .where(eq(awardCategories.uid, trimmedCategoryUid))
      .limit(1);

    const category = categoryRows[0];
    if (!category) {
      throw new NotFoundError('Category not found');
    }

    if (category.organizationUid !== ceremony.organizationUid) {
      throw new ValidationError(
        'Category does not belong to the ceremony organization',
      );
    }

    if (!this.env.BROWSER) {
      throw new ExternalFetchError(
        'Browser Rendering binding is not configured. Add [browser] binding to wrangler.toml.',
      );
    }

    const normalizedUrl = ensureTrailingSlash(imdbEventUrl);

    let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
    let isReusedExistingSession = false;
    try {
      const sessions = await puppeteer.sessions(this.env.BROWSER);
      const freeSession = sessions.find(s => !s.connectionId);
      if (freeSession) {
        try {
          browser = await puppeteer.connect(
            this.env.BROWSER,
            freeSession.sessionId,
          );
          isReusedExistingSession = true;
        } catch (error) {
          console.warn(
            'Failed to reuse existing browser session; launching new:',
            error instanceof Error ? error.message : error,
          );
        }
      }
    } catch (error) {
      console.warn(
        'Failed to enumerate browser sessions; launching new:',
        error instanceof Error ? error.message : error,
      );
    }

    if (!browser) {
      browser = await puppeteer.launch(this.env.BROWSER);
    }

    let html: string;
    try {
      const existingPages = isReusedExistingSession
        ? await browser.pages()
        : [];
      const page =
        existingPages.length > 0 ? existingPages[0] : await browser.newPage();
      await page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      );
      const gotoWithRetry = async (): Promise<void> => {
        const maxAttempts = 3;
        let lastError: unknown;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            await page.goto(normalizedUrl, {
              waitUntil: 'domcontentloaded',
              timeout: 30_000,
            });
            return;
          } catch (error) {
            lastError = error;
            const message = error instanceof Error ? error.message : '';
            const isTransient =
              message.includes('Requesting main frame too early') ||
              message.includes('Target closed') ||
              message.includes('Connection closed');
            if (!isTransient || attempt === maxAttempts) {
              break;
            }

            await new Promise(resolve => setTimeout(resolve, 500 * attempt));
          }
        }

        if (
          lastError instanceof Error &&
          lastError.message.includes('Session closed')
        ) {
          throw new ExternalFetchError(
            'Failed to fetch IMDb event page: browser session closed unexpectedly (Cloudflare Browser Rendering may be at concurrent session limit; retry in a moment)',
            {cause: lastError},
          );
        }

        throw new ExternalFetchError(
          `Failed to fetch IMDb event page: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
          {cause: lastError},
        );
      };

      await gotoWithRetry();

      try {
        await page.waitForSelector('script#__NEXT_DATA__', {timeout: 20_000});
      } catch {
        throw new Error(
          'IMDb page did not load expected content (timed out waiting for __NEXT_DATA__)',
        );
      }
      html = await page.content();
    } finally {
      try {
        await (isReusedExistingSession
          ? browser.disconnect()
          : browser.close());
      } catch {
        // Session/browser may already be closed by the platform; ignore
      }
    }
    const marker = '<script id="__NEXT_DATA__" type="application/json">';
    const markerIndex = html.indexOf(marker);

    if (markerIndex === -1) {
      throw new UnprocessableContentError(
        'IMDb event page format is not supported (missing __NEXT_DATA__ payload)',
      );
    }

    const startIndex = markerIndex + marker.length;
    const endIndex = html.indexOf('</script>', startIndex);

    if (endIndex === -1) {
      throw new UnprocessableContentError(
        'IMDb event page format is not supported (unterminated __NEXT_DATA__ payload)',
      );
    }

    let nextData: ImdbNextData;
    try {
      const jsonText = html.slice(startIndex, endIndex);
      nextData = JSON.parse(jsonText) as ImdbNextData;
    } catch (error) {
      console.error('Failed to parse IMDb __NEXT_DATA__ payload:', error);
      throw new Error('Failed to parse IMDb event payload', {cause: error});
    }

    const normalizedTarget = normalizeCategoryName(category.name);
    const targetNames = new Set<string>([normalizedTarget]);
    const commonSynonyms = [
      'best film',
      'best picture',
      'best motion picture',
      'best motion picture of the year',
      'picture of the year',
      'outstanding picture',
      'outstanding production',
      'outstanding motion picture',
    ].map(synonym => normalizeCategoryName(synonym));

    const japaneseBestFilmMarkers = [
      '優秀作品賞',
      '最優秀作品賞',
      '最優秀作品',
      '作品賞',
      '最優秀日本作品賞',
      '最優秀日本映画賞',
    ].map(marker => normalizeCategoryName(marker));

    const englishBestFilmMarkers = commonSynonyms;

    const targetLooksLikeBestFilm =
      japaneseBestFilmMarkers.some(marker => {
        return (
          normalizedTarget.includes(marker) || marker.includes(normalizedTarget)
        );
      }) ||
      englishBestFilmMarkers.some(marker => {
        return (
          normalizedTarget.includes(marker) || marker.includes(normalizedTarget)
        );
      });

    if (targetLooksLikeBestFilm) {
      for (const synonym of commonSynonyms) {
        targetNames.add(synonym);
      }
    } else {
      for (const synonym of commonSynonyms) {
        if (
          normalizedTarget.includes(synonym) ||
          synonym.includes(normalizedTarget)
        ) {
          targetNames.add(synonym);
        }
      }
    }

    for (const group of AWARD_SYNONYM_GROUPS) {
      if (group.some(s => targetNames.has(s) || normalizedTarget === s)) {
        for (const synonym of group) {
          targetNames.add(synonym);
        }
      }
    }

    const {categoryName: imdbCategoryName, nominations: imdbNominations} =
      extractImdbNominations(nextData, targetNames);

    if (imdbNominations.length === 0) {
      throw new UnprocessableContentError(
        `IMDb event page did not provide nominations for category "${category.name}"`,
      );
    }

    let moviesCreated = 0;
    let skipped = 0;
    const ensuredMovies = new Map<string, string>();

    for (const nomination of imdbNominations) {
      if (!nomination.imdbId) {
        skipped++;
        continue;
      }

      if (ensuredMovies.has(nomination.imdbId)) {
        continue;
      }

      const existing = await this.database
        .select({uid: movies.uid})
        .from(movies)
        .where(eq(movies.imdbId, nomination.imdbId))
        .limit(1);

      if (existing.length > 0) {
        ensuredMovies.set(nomination.imdbId, existing[0].uid);
        continue;
      }

      try {
        const created = await this.createMovieFromImdbId(nomination.imdbId);
        ensuredMovies.set(nomination.imdbId, created.movie.uid);
        moviesCreated++;
      } catch (error) {
        console.error(
          `[imdb-sync] createMovie error for ${nomination.imdbId}:`,
          error instanceof Error ? error.message : error,
        );
        if (
          error instanceof TmdbConfigError ||
          error instanceof TmdbDataNotFoundError
        ) {
          const fallback = await this.createMovieFromImdbId(nomination.imdbId, {
            fetchTMDBData: false,
          });
          ensuredMovies.set(nomination.imdbId, fallback.movie.uid);
          moviesCreated++;
          continue;
        }

        if (error instanceof ConflictError) {
          const recheck = await this.database
            .select({uid: movies.uid})
            .from(movies)
            .where(eq(movies.imdbId, nomination.imdbId))
            .limit(1);

          if (recheck.length > 0) {
            ensuredMovies.set(nomination.imdbId, recheck[0].uid);
            continue;
          }
        }

        throw error;
      }
    }

    const now = Math.floor(Date.now() / 1000);
    const insertedMovieKeys = new Set<string>();
    const nominationRecords: Array<typeof nominations.$inferInsert> = [];

    for (const nomination of imdbNominations) {
      if (!nomination.imdbId) {
        continue;
      }

      const movieUid = ensuredMovies.get(nomination.imdbId);
      if (!movieUid) {
        continue;
      }

      if (insertedMovieKeys.has(movieUid)) {
        continue;
      }

      insertedMovieKeys.add(movieUid);

      const record: typeof nominations.$inferInsert = {
        movieUid,
        ceremonyUid: ceremony.uid,
        categoryUid: category.uid,
        isWinner: nomination.isWinner ? 1 : 0,
        createdAt: now,
      };

      if (nomination.notes && nomination.notes !== '') {
        record.specialMention = nomination.notes;
      }

      nominationRecords.push(record);
    }

    if (nominationRecords.length === 0) {
      throw new UnprocessableContentError(
        'IMDb nominations could not be matched to any movies (missing IMDb IDs)',
      );
    }

    await this.database.transaction(async trx => {
      await trx
        .delete(nominations)
        .where(
          and(
            eq(nominations.ceremonyUid, ceremony.uid),
            eq(nominations.categoryUid, category.uid),
          ),
        );

      await trx.insert(nominations).values(nominationRecords);
    });

    return {
      moviesCreated,
      nominationsInserted: nominationRecords.length,
      skipped,
      imdbEntries: imdbNominations.length,
      categoryName: imdbCategoryName ?? category.name,
    };
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
