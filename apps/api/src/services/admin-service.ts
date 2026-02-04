import {and, eq, not, sql} from '@shine/database';
import {articleLinks} from '@shine/database/schema/article-links';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movieSelections} from '@shine/database/schema/movie-selections';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {posterUrls} from '@shine/database/schema/poster-urls';
import {referenceUrls} from '@shine/database/schema/reference-urls';
import {translations} from '@shine/database/schema/translations';
import type {TMDBMovieData} from '@shine/scrapers/common/tmdb-utilities';
import {generateUUID} from '@shine/utils';
import {BaseService} from './base-service';
import type {
  MergeMoviesOptions,
  PaginationOptions,
  UpdateIMDBIdOptions,
} from '@shine/types';

type ImdbNextData = {
  props?: {
    pageProps?: {
      edition?: {
        awards?: Array<{
          text?: string | null;
          nominationCategories?: {
            edges?: Array<{
              node?: {
                category?: {text?: string | null};
                nominations?: {
                  edges?: Array<{
                    node?: {
                      isWinner?: boolean | null;
                      notes?: unknown;
                      awardedEntities?: {
                        awardTitles?: Array<{
                          title?: {
                            id?: string | null;
                            titleText?: {text?: string | null};
                            originalTitleText?: {
                              text?: string | null;
                            };
                          };
                        }>;
                      };
                    };
                  }>;
                };
              };
            }>;
          };
        }>;
      };
    };
  };
};

type ImdbNomination = {
  imdbId?: string;
  title?: string;
  isWinner: boolean;
  notes?: string;
};

const IMDB_FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
  'Accept-Language': 'en-US,en;q=0.9',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

const ensureTrailingSlash = (value: string): string =>
  value.endsWith('/') ? value : `${value}/`;

const normalizeCategoryName = (value: string): string =>
  value
    .normalize('NFKC')
    .toLowerCase()
    .replaceAll('’', "'")
    .replaceAll(/[（）]/g, match => (match === '（' ? '(' : ')'))
    .replaceAll(/\s+/g, ' ')
    .trim();

const extractNoteText = (note: unknown): string | undefined => {
  if (typeof note === 'string') {
    const trimmed = note.trim();
    return trimmed === '' ? undefined : trimmed;
  }

  if (note && typeof note === 'object') {
    const plainText =
      (typeof (note as {plainText?: unknown}).plainText === 'string'
        ? (note as {plainText: string}).plainText
        : undefined) ??
      (typeof (note as {value?: {plainText?: unknown}}).value?.plainText ===
      'string'
        ? (note as {value: {plainText: string}}).value.plainText
        : undefined);

    if (plainText) {
      const trimmed = plainText.trim();
      return trimmed === '' ? undefined : trimmed;
    }
  }

  return undefined;
};

const extractImdbNominations = (
  data: ImdbNextData,
  targetNames: Set<string>,
): {categoryName?: string; nominations: ImdbNomination[]} => {
  const awards = data?.props?.pageProps?.edition?.awards ?? [];

  const matchesTarget = (name: string): boolean => {
    const normalized = normalizeCategoryName(name);
    if (targetNames.has(normalized)) {
      return true;
    }

    for (const candidate of targetNames) {
      if (normalized.includes(candidate) || candidate.includes(normalized)) {
        return true;
      }
    }

    return false;
  };

  const categoryEdges = awards.flatMap(award => {
    const edges = award?.nominationCategories?.edges ?? [];
    return edges.map(edge => ({edge, award}));
  });

  const targetEntry = categoryEdges.find(({edge, award}) => {
    const categoryName = edge?.node?.category?.text;
    const awardName = award?.text;

    if (typeof categoryName === 'string' && categoryName.trim() !== '') {
      return matchesTarget(categoryName);
    }

    if (typeof awardName === 'string' && awardName.trim() !== '') {
      return matchesTarget(awardName);
    }

    return false;
  });

  if (!targetEntry?.edge?.node) {
    return {nominations: []};
  }

  const nominations: ImdbNomination[] = [];
  const nominationEdges = targetEntry.edge.node.nominations?.edges ?? [];

  for (const edge of nominationEdges) {
    const node = edge?.node;
    if (!node) {
      continue;
    }

    const titleInfo = node.awardedEntities?.awardTitles?.[0]?.title;
    const imdbId =
      typeof titleInfo?.id === 'string' ? titleInfo.id.trim() : undefined;
    const englishTitle =
      typeof titleInfo?.titleText?.text === 'string'
        ? titleInfo.titleText.text.trim()
        : undefined;
    const originalTitle =
      typeof titleInfo?.originalTitleText?.text === 'string'
        ? titleInfo.originalTitleText.text.trim()
        : undefined;

    nominations.push({
      imdbId: imdbId && imdbId !== '' ? imdbId : undefined,
      title: englishTitle && englishTitle !== '' ? englishTitle : originalTitle,
      isWinner: Boolean(node.isWinner),
      notes: extractNoteText(node.notes),
    });
  }

  const resolvedCategoryName =
    typeof targetEntry.edge.node.category?.text === 'string' &&
    targetEntry.edge.node.category.text.trim() !== ''
      ? targetEntry.edge.node.category.text
      : typeof targetEntry.award?.text === 'string' &&
          targetEntry.award.text.trim() !== ''
        ? targetEntry.award.text
        : undefined;

  return {
    categoryName: resolvedCategoryName,
    nominations,
  };
};

export class AdminService extends BaseService {
  async getMovies(options: PaginationOptions & {search?: string}) {
    const {page, limit, search} = options;
    const offset = (page - 1) * limit;

    if (search) {
      // Search across both Japanese and English titles
      const searchPattern = `%${search}%`;

      // Use CTE to get all movies that match either Japanese or English titles
      const searchQuery = this.database
        .select({
          uid: movies.uid,
          year: movies.year,
          originalLanguage: movies.originalLanguage,
          imdbId: movies.imdbId,
          jaTitle: sql`
						(
							SELECT content
							FROM translations
							WHERE translations.resource_uid = movies.uid
							AND translations.resource_type = 'movie_title'
							AND translations.language_code = 'ja'
							LIMIT 1
						)
					`.as('jaTitle'),
          enTitle: sql`
						(
							SELECT content
							FROM translations
							WHERE translations.resource_uid = movies.uid
							AND translations.resource_type = 'movie_title'
							AND translations.language_code = 'en'
							LIMIT 1
						)
					`.as('enTitle'),
          posterUrl: sql`
						(
							SELECT url
							FROM poster_urls
							WHERE poster_urls.movie_uid = movies.uid
							LIMIT 1
						)
					`.as('posterUrl'),
          nominationCount: sql`
						(
							SELECT COUNT(*)
							FROM nominations
							WHERE nominations.movie_uid = movies.uid
						)
					`.as('nominationCount'),
        })
        .from(movies)
        .where(
          sql`
					EXISTS (
											SELECT 1 FROM translations 
											WHERE translations.resource_uid = movies.uid
											AND translations.resource_type = 'movie_title'
											AND translations.content LIKE ${searchPattern}
										)
				`,
        )
        .orderBy(sql`${movies.createdAt} DESC`)
        .limit(limit)
        .offset(offset);

      const allMovies = await searchQuery;

      // Count total matching movies
      const totalCountResult = await this.database
        .select({count: sql`COUNT(*)`.as('count')})
        .from(movies).where(sql`
					EXISTS (
											SELECT 1 FROM translations 
											WHERE translations.resource_uid = movies.uid
											AND translations.resource_type = 'movie_title'
											AND translations.content LIKE ${searchPattern}
										)
				`);

      const totalCount = Number(totalCountResult[0]?.count) || 0;
      const totalPages = Math.ceil(totalCount / limit);

      // Format the results to prefer Japanese title but fall back to English
      const formattedMovies = allMovies.map(movie => ({
        uid: movie.uid,
        year: movie.year,
        originalLanguage: movie.originalLanguage,
        imdbId: movie.imdbId,
        title: movie.jaTitle || movie.enTitle || 'Untitled',
        posterUrl: movie.posterUrl,
        nominationCount: movie.nominationCount,
      }));

      return {
        movies: formattedMovies,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      };
    }

    // No search - return all movies with Japanese titles preferred
    const baseQuery = this.database
      .select({
        uid: movies.uid,
        year: movies.year,
        originalLanguage: movies.originalLanguage,
        imdbId: movies.imdbId,
        title: sql`
					COALESCE(
						(
							SELECT content
							FROM translations
							WHERE translations.resource_uid = movies.uid
							AND translations.resource_type = 'movie_title'
							AND translations.language_code = 'ja'
							LIMIT 1
						),
						(
							SELECT content
							FROM translations
							WHERE translations.resource_uid = movies.uid
							AND translations.resource_type = 'movie_title'
							AND translations.language_code = 'en'
							LIMIT 1
						),
						'Untitled'
					)
				`.as('title'),
        posterUrl: sql`
					(
						SELECT url
						FROM poster_urls
						WHERE poster_urls.movie_uid = movies.uid
						LIMIT 1
					)
				`.as('posterUrl'),
        nominationCount: sql`
					(
						SELECT COUNT(*)
						FROM nominations
						WHERE nominations.movie_uid = movies.uid
					)
				`.as('nominationCount'),
      })
      .from(movies);

    const allMovies = await baseQuery
      .orderBy(sql`${movies.createdAt} DESC`)
      .limit(limit)
      .offset(offset);

    const totalCountResult = await this.database
      .select({count: sql`COUNT(*)`.as('count')})
      .from(movies);

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
      throw new Error('IMDb ID is required');
    }

    if (!/^tt\d+$/.test(normalizedImdbId)) {
      throw new Error('Invalid IMDb ID format');
    }

    const existingMovie = await this.database
      .select({uid: movies.uid})
      .from(movies)
      .where(eq(movies.imdbId, normalizedImdbId))
      .limit(1);

    if (existingMovie.length > 0) {
      throw new Error('IMDb ID already exists for another movie');
    }

    const {fetchTMDBData = true} = options;

    let tmdbMovieId: number | undefined;
    let tmdbMovieData: TMDBMovieData | undefined;

    if (fetchTMDBData) {
      const tmdbData = await this.fetchTMDBDataByImdbId(normalizedImdbId);

      if (!tmdbData) {
        throw new Error('TMDB data not found for IMDb ID');
      }

      tmdbMovieId = tmdbData.tmdbId;
      tmdbMovieData = tmdbData.movie;

      if (tmdbMovieId !== undefined) {
        const existingByTmdb = await this.database
          .select({uid: movies.uid})
          .from(movies)
          .where(eq(movies.tmdbId, tmdbMovieId))
          .limit(1);

        if (existingByTmdb.length > 0) {
          throw new Error('TMDB ID already exists for another movie');
        }
      }
    }

    let releaseYear: number | undefined;
    if (tmdbMovieData?.release_date) {
      const parsedYear = Number.parseInt(
        tmdbMovieData.release_date.slice(0, 4),
        10,
      );
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

    let newMovie: typeof movies.$inferSelect | undefined;

    try {
      [newMovie] = await this.database
        .insert(movies)
        .values(movieValues)
        .returning();
    } catch (error) {
      if (this.isMissingColumnError(error, 'release_date')) {
        newMovie = await this.insertMovieWithoutReleaseDate(
          movieValues,
          normalizedImdbId,
        );
      } else {
        throw error;
      }
    }

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
              updatedAt: Math.floor(Date.now() / 1000),
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
      })
      .from(movies)
      .where(eq(movies.uid, movieId))
      .limit(1);

    if (movieResult.length === 0) {
      throw new Error('Movie not found');
    }

    const movie = movieResult[0];

    // Get all translations
    const translationsResult = await this.database
      .select({
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
      throw new Error('Invalid IMDb ID format');
    }

    // Check if movie exists
    const movieExists = await this.database
      .select({uid: movies.uid})
      .from(movies)
      .where(eq(movies.uid, movieId))
      .limit(1);

    if (movieExists.length === 0) {
      throw new Error('Movie not found');
    }

    // Check for duplicate IMDb ID if setting one
    if (imdbId) {
      const existingMovie = await this.database
        .select({uid: movies.uid})
        .from(movies)
        .where(and(eq(movies.imdbId, imdbId), not(eq(movies.uid, movieId))))
        .limit(1);

      if (existingMovie.length > 0) {
        throw new Error('IMDb ID already exists for another movie');
      }
    }

    let tmdbId: number | undefined;
    let postersAdded = 0;
    let translationsAdded = 0;

    if (fetchTMDBData) {
      try {
        const tmdbData = await this.fetchTMDBDataByImdbId(imdbId);
        if (tmdbData) {
          tmdbId = tmdbData.tmdbId;
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
                updatedAt: Math.floor(Date.now() / 1000),
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
        updatedAt: Math.floor(Date.now() / 1000),
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
      throw new Error('TMDb API key not configured');
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
      throw new Error('Movie not found');
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
      throw new Error('Unable to determine search query');
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

    const searchResponse = await fetch(searchUrl.toString());

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

          const externalResponse = await fetch(externalUrl.toString());
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
          ? Number.parseInt(item.release_date.slice(0, 4), 10)
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
        updatedAt: Math.floor(Date.now() / 1000),
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

  async flagArticleAsSpam(articleId: string): Promise<void> {
    await this.database
      .update(articleLinks)
      .set({isSpam: true})
      .where(eq(articleLinks.uid, articleId));
  }

  async deleteArticleLink(articleId: string): Promise<void> {
    await this.database
      .delete(articleLinks)
      .where(eq(articleLinks.uid, articleId));
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
          updatedAt: Math.floor(Date.now() / 1000),
        })
        .where(eq(nominations.movieUid, sourceMovieId));

      // Merge movie selections
      await trx
        .update(movieSelections)
        .set({
          movieId: targetMovieId,
          updatedAt: Math.floor(Date.now() / 1000),
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
          updatedAt: Math.floor(Date.now() / 1000),
        })
        .where(eq(referenceUrls.movieUid, sourceMovieId));

      // Update or delete translations based on preserveTranslations flag
      void (preserveTranslations
        ? await trx
            .update(translations)
            .set({
              resourceUid: targetMovieId,
              updatedAt: Math.floor(Date.now() / 1000),
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
              updatedAt: Math.floor(Date.now() / 1000),
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
      throw new Error('Category UID is required');
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
      throw new Error('Ceremony not found');
    }

    const imdbEventUrl = ceremony.imdbEventUrl?.trim();
    if (!imdbEventUrl) {
      throw new Error('Ceremony does not have an IMDb event URL configured');
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
      throw new Error('Category not found');
    }

    if (category.organizationUid !== ceremony.organizationUid) {
      throw new Error('Category does not belong to the ceremony organization');
    }

    const normalizedUrl = ensureTrailingSlash(imdbEventUrl);
    const response = await fetch(normalizedUrl, {
      headers: IMDB_FETCH_HEADERS,
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch IMDb event page (status ${response.status})`,
      );
    }

    const html = await response.text();
    const marker = '<script id="__NEXT_DATA__" type="application/json">';
    const markerIndex = html.indexOf(marker);

    if (markerIndex === -1) {
      throw new Error(
        'IMDb event page format is not supported (missing __NEXT_DATA__ payload)',
      );
    }

    const startIndex = markerIndex + marker.length;
    const endIndex = html.indexOf('</script>', startIndex);

    if (endIndex === -1) {
      throw new Error(
        'IMDb event page format is not supported (unterminated __NEXT_DATA__ payload)',
      );
    }

    let nextData: ImdbNextData;
    try {
      const jsonText = html.slice(startIndex, endIndex);
      nextData = JSON.parse(jsonText) as ImdbNextData;
    } catch (error) {
      console.error('Failed to parse IMDb __NEXT_DATA__ payload:', error);
      throw new Error('Failed to parse IMDb event payload');
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

    const {categoryName: imdbCategoryName, nominations: imdbNominations} =
      extractImdbNominations(nextData, targetNames);

    if (imdbNominations.length === 0) {
      throw new Error(
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
        if (
          error instanceof Error &&
          (error.message === 'TMDB API key not configured' ||
            error.message === 'TMDB data not found for IMDb ID')
        ) {
          const fallback = await this.createMovieFromImdbId(nomination.imdbId, {
            fetchTMDBData: false,
          });
          ensuredMovies.set(nomination.imdbId, fallback.movie.uid);
          moviesCreated++;
          continue;
        }

        if (
          error instanceof Error &&
          error.message === 'IMDb ID already exists for another movie'
        ) {
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

      nominationRecords.push({
        movieUid,
        ceremonyUid: ceremony.uid,
        categoryUid: category.uid,
        isWinner: nomination.isWinner ? 1 : 0,
        specialMention:
          nomination.notes && nomination.notes !== ''
            ? nomination.notes
            : undefined,
        createdAt: now,
        updatedAt: now,
      });
    }

    if (nominationRecords.length === 0) {
      throw new Error(
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
      }
    | undefined
  > {
    const apiKey = this.env.TMDB_API_KEY;
    if (!apiKey) {
      throw new Error('TMDB API key not configured');
    }

    // Find TMDb ID from IMDb ID
    const findResponse = await fetch(
      `https://api.themoviedb.org/3/find/${imdbId}?api_key=${apiKey}&external_source=imdb_id`,
    );

    if (!findResponse.ok) {
      throw new Error(`TMDB API error: ${findResponse.statusText}`);
    }

    const findData: {
      movie_results?: Array<{id: number}>;
    } = await findResponse.json();
    if (!findData.movie_results || findData.movie_results.length === 0) {
      return undefined;
    }

    const tmdbId = findData.movie_results[0].id;

    // Get detailed movie data with translations
    const movieResponse = await fetch(
      `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${apiKey}&append_to_response=translations`,
    );

    if (!movieResponse.ok) {
      throw new Error(`TMDB API error: ${movieResponse.statusText}`);
    }

    const movieData: TMDBMovieData = await movieResponse.json();

    return {
      tmdbId,
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
      updatedAt: Math.floor(Date.now() / 1000),
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
        updatedAt: now,
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
          updatedAt: now,
        });
        addedCount++;
      }
    }

    for (const translation of tmdbTranslations) {
      const languageCode = translation.iso_639_1;
      const title = translation.data?.title;

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
          updatedAt: now,
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
          updatedAt: now,
        })
        .where(translationQuery);
    }

    return addedCount;
  }

  private isMissingColumnError(error: unknown, column: string): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const message = error.message ?? '';
    if (
      message.includes(`column named ${column}`) ||
      message.includes(`no such column: ${column}`) ||
      message.includes(`has no column named ${column}`)
    ) {
      return true;
    }

    const cause = (error as {cause?: unknown}).cause;
    if (cause) {
      return this.isMissingColumnError(cause, column);
    }

    return false;
  }

  private async insertMovieWithoutReleaseDate(
    movieValues: typeof movies.$inferInsert,
    imdbId: string,
  ): Promise<typeof movies.$inferSelect> {
    const uid = generateUUID();
    const now = Math.floor(Date.now() / 1000);
    const originalLanguage = movieValues.originalLanguage ?? 'en';
    const year =
      typeof movieValues.year === 'number' ? movieValues.year : undefined;
    const tmdbIdValue =
      typeof movieValues.tmdbId === 'number' ? movieValues.tmdbId : undefined;

    type LibsqlExecuteResult = {
      rows?: Array<Record<string, unknown>>;
    };
    type LibsqlClient = {
      execute: (input: {
        sql: string;
        args?: unknown[];
      }) => Promise<LibsqlExecuteResult>;
    };

    const client = (
      this.database as unknown as {
        session?: {client?: LibsqlClient};
      }
    )?.session?.client;

    if (!client?.execute) {
      throw new Error('Database client does not support raw execute');
    }

    await client.execute({
      sql: `
        INSERT INTO movies (
          uid,
          original_language,
          year,
          imdb_id,
          tmdb_id,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      args: [uid, originalLanguage, year, imdbId, tmdbIdValue, now, now],
    });

    const inserted = await client.execute({
      sql: `
        SELECT
          uid,
          original_language,
          year,
          imdb_id,
          tmdb_id,
          created_at,
          updated_at
        FROM movies
        WHERE uid = ?
        LIMIT 1
      `,
      args: [uid],
    });

    const row = inserted.rows?.[0];

    if (!row || typeof row.uid !== 'string') {
      throw new Error('Failed to create movie');
    }

    const result: Partial<typeof movies.$inferSelect> = {
      uid: row.uid as string,
      originalLanguage:
        typeof row.original_language === 'string'
          ? (row.original_language as string)
          : originalLanguage,
      imdbId:
        typeof row.imdb_id === 'string' ? (row.imdb_id as string) : imdbId,
      createdAt:
        typeof row.created_at === 'number' ? (row.created_at as number) : now,
      updatedAt:
        typeof row.updated_at === 'number' ? (row.updated_at as number) : now,
    };

    if (typeof row.year === 'number') {
      result.year = row.year as number;
    }

    if (typeof row.tmdb_id === 'number') {
      result.tmdbId = row.tmdb_id as number;
    }

    if (typeof (row as Record<string, unknown>).release_date === 'string') {
      result.releaseDate = (row as Record<string, unknown>)
        .release_date as string;
    }

    return result as typeof movies.$inferSelect;
  }
}
