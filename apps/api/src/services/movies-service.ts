import {and, eq, inArray, isNull, sql} from '@shine/database';
import {articleLinks} from '@shine/database/schema/article-links';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {posterUrls} from '@shine/database/schema/poster-urls';
import {translations} from '@shine/database/schema/translations';
import {
  EdgeCache,
  getCacheKeyForMovie,
  getCacheTTL,
  getMovieCacheKeysForAllLocales,
  normalizeCacheLocale,
} from '../utils/cache';
import {BaseService} from './base-service';
import type {MovieSelection, SearchOptions} from '@shine/types';

export class MoviesService extends BaseService {
  private readonly cache = new EdgeCache();

  async searchMovies(options: SearchOptions) {
    const {page, limit, query, year, language, hasAwards} = options;
    const offset = (page - 1) * limit;

    // Build search conditions
    const conditions = [isNull(movies.deletedAt)];

    if (query) {
      conditions.push(sql`
				EXISTS (
				  SELECT 1
				  FROM translations
				  WHERE translations.resource_uid = movies.uid
				    AND translations.resource_type = 'movie_title'
				    AND translations.content LIKE ${`%${query}%`}
				)
			`);
    }

    if (year && !Number.isNaN(Number(year))) {
      conditions.push(eq(movies.year, Number(year)));
    }

    if (language) {
      conditions.push(eq(movies.originalLanguage, language));
    }

    if (hasAwards === true) {
      conditions.push(sql`
				EXISTS (
				  SELECT 1
				  FROM nominations
				  WHERE nominations.movie_uid = movies.uid
				)
			`);
    } else if (hasAwards === false) {
      conditions.push(sql`
				NOT EXISTS (
				  SELECT 1
				  FROM nominations
				  WHERE nominations.movie_uid = movies.uid
				)
			`);
    }

    // Base query with movie and translation data
    const baseQuery = this.database
      .select({
        uid: movies.uid,
        year: movies.year,
        originalLanguage: movies.originalLanguage,
        imdbId: movies.imdbId,
        title: sql<string | null>`
					(
					  SELECT content
					  FROM translations
					  WHERE translations.resource_uid = movies.uid
					    AND translations.resource_type = 'movie_title'
					  ORDER BY (translations.language_code = 'ja') DESC,
					    translations.is_default DESC,
					    (translations.language_code = 'en') DESC
					  LIMIT 1
					)
				`.as('title'),
        hasNominations: sql`
					(
					  SELECT COUNT(*) > 0
					  FROM nominations
					  WHERE nominations.movie_uid = movies.uid
					)
				`.as('hasNominations'),
      })
      .from(movies);

    type BaseQuery = typeof baseQuery;
    type SearchResultRow = Awaited<ReturnType<BaseQuery['execute']>>[number];

    const finalQuery = baseQuery.where(and(...conditions));

    const countQuery = this.database
      .select({count: sql`COUNT(*)`.as('count')})
      .from(movies)
      .where(and(...conditions));

    // Run search and count queries in parallel
    const [searchResults, totalCountResult] = await Promise.all([
      finalQuery
        .orderBy(movies.year, movies.uid)
        .limit(limit)
        .offset(offset) as Promise<SearchResultRow[]>,
      countQuery,
    ]);

    const totalCount = Number(totalCountResult[0]?.count) || 0;
    const totalPages = Math.ceil(totalCount / limit);

    // Fetch all posters for the search result movies in one query
    const movieIds = searchResults.map(m => m.uid);
    const allPosters =
      movieIds.length > 0
        ? await this.database
            .select({
              movieUid: posterUrls.movieUid,
              url: posterUrls.url,
              languageCode: posterUrls.languageCode,
              isPrimary: posterUrls.isPrimary,
            })
            .from(posterUrls)
            .where(inArray(posterUrls.movieUid, movieIds))
            .orderBy(
              sql`${posterUrls.isPrimary} DESC, ${posterUrls.createdAt} ASC`,
            )
        : [];

    // Group posters by movie ID
    const postersByMovie = new Map<
      string,
      Array<{
        url: string;
        languageCode: string | null;
        isPrimary: number | null;
      }>
    >();
    for (const poster of allPosters) {
      const existing = postersByMovie.get(poster.movieUid) ?? [];
      existing.push(poster);
      postersByMovie.set(poster.movieUid, existing);
    }

    return {
      movies: searchResults.map(movie => ({
        uid: movie.uid,
        year: movie.year ?? undefined,
        originalLanguage: movie.originalLanguage,
        imdbId: movie.imdbId ?? undefined,
        title:
          movie.title ??
          (movie.year ? `Unknown Title (${movie.year})` : 'Unknown Title'),
        posterUrls: (postersByMovie.get(movie.uid) ?? []).map(p => ({
          url: p.url,
          languageCode: p.languageCode ?? undefined,
          isPrimary: p.isPrimary ?? 0,
        })),
        hasNominations: Boolean(movie.hasNominations),
      })),
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  async getMovieDetails(
    movieId: string,
    locale = 'ja',
  ): Promise<MovieSelection> {
    const cacheLocale = normalizeCacheLocale(locale);
    const cacheKey = cacheLocale
      ? getCacheKeyForMovie(movieId, false, cacheLocale)
      : undefined;

    // Try to get cached result
    const cached = cacheKey ? await this.cache.get(cacheKey) : undefined;
    if (cached?.data) {
      return cached.data as MovieSelection;
    }

    // Get movie with title and description
    const movieResult = await this.database
      .select({
        uid: movies.uid,
        year: movies.year,
        originalLanguage: movies.originalLanguage,
        imdbId: movies.imdbId,
        tmdbId: movies.tmdbId,
        mediaType: movies.mediaType,
        title: sql<string | null>`
					(
					  SELECT content
					  FROM translations
					  WHERE translations.resource_uid = movies.uid
					    AND translations.resource_type = 'movie_title'
					  ORDER BY (translations.language_code = ${locale}) DESC,
					    translations.is_default DESC,
					    (translations.language_code = 'ja') DESC,
					    (translations.language_code = 'en') DESC
					  LIMIT 1
					)
				`.as('title'),
        description: sql`
					(
					  SELECT content
					  FROM translations
					  WHERE translations.resource_uid = movies.uid
					    AND translations.resource_type = 'movie_description'
					    AND translations.language_code = ${locale}
					  LIMIT 1
					)
				`.as('description'),
        posterUrl: sql`
					(
					  SELECT url
					  FROM poster_urls
					  WHERE poster_urls.movie_uid = movies.uid
					  ORDER BY poster_urls.is_primary DESC, poster_urls.created_at ASC
					  LIMIT 1
					)
				`.as('posterUrl'),
      })
      .from(movies)
      .where(and(eq(movies.uid, movieId), isNull(movies.deletedAt)))
      .limit(1);

    if (movieResult.length === 0) {
      throw new Error('Movie not found');
    }

    const movie = movieResult[0];

    // Get nominations
    const nominationsData = await this.database
      .select({
        nominationUid: nominations.uid,
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
    const topArticles = await this.database
      .select({
        uid: articleLinks.uid,
        url: articleLinks.url,
        title: articleLinks.title,
        description: articleLinks.description || undefined,
      })
      .from(articleLinks)
      .where(
        and(
          eq(articleLinks.movieUid, movieId),
          eq(articleLinks.isSpam, false),
          eq(articleLinks.isFlagged, false),
        ),
      )
      .orderBy(sql`${articleLinks.submittedAt} DESC`)
      .limit(3);

    const movieDetails: MovieSelection = {
      uid: movie.uid,
      year: movie.year ?? 0,
      originalLanguage: movie.originalLanguage,
      imdbId: movie.imdbId ?? undefined,
      tmdbId: movie.tmdbId ?? undefined,
      title: movie.title || `Unknown Title (${movie.year})`,
      description: (movie.description as string) || undefined,
      imdbUrl: movie.imdbId
        ? `https://www.imdb.com/title/${movie.imdbId}/`
        : undefined,
      posterUrl: (movie.posterUrl as string) || undefined,
      nominations: nominationsData.map(nom => ({
        uid: nom.nominationUid,
        isWinner: Boolean(nom.isWinner),
        specialMention: nom.specialMention ?? undefined,
        category: {
          uid: nom.categoryUid,
          name: nom.categoryName,
        },
        ceremony: {
          uid: nom.ceremonyUid,
          number: nom.ceremonyNumber ?? undefined,
          year: nom.ceremonyYear,
        },
        organization: {
          uid: nom.organizationUid,
          name: nom.organizationName,
          shortName: nom.organizationShortName ?? undefined,
        },
      })),
      articleLinks: topArticles.map(article => ({
        uid: article.uid,
        url: article.url,
        title: article.title,
        description: article.description || undefined,
      })),
    };

    // Cache result
    if (cacheKey) {
      await this.cache.set(cacheKey, movieDetails, getCacheTTL.movie.basic);
    }

    return movieDetails;
  }

  async addMovieTranslation(
    movieId: string,
    languageCode: string,
    title: string,
    isDefault = false,
    description?: string,
  ): Promise<void> {
    // Check if movie exists
    const movieExists = await this.database
      .select({uid: movies.uid})
      .from(movies)
      .where(eq(movies.uid, movieId))
      .limit(1);

    if (movieExists.length === 0) {
      throw new Error('Movie not found');
    }

    await this.database.transaction(async trx => {
      const now = Math.floor(Date.now() / 1000);

      if (isDefault) {
        await trx
          .update(translations)
          .set({isDefault: 0})
          .where(
            and(
              eq(translations.resourceUid, movieId),
              eq(translations.resourceType, 'movie_title'),
            ),
          );
      }

      // Add or update title translation
      const existingTitle = await trx
        .select({uid: translations.uid})
        .from(translations)
        .where(
          and(
            eq(translations.resourceUid, movieId),
            eq(translations.resourceType, 'movie_title'),
            eq(translations.languageCode, languageCode),
          ),
        )
        .limit(1);

      // Update existing title or insert new one
      void (existingTitle.length > 0
        ? await trx
            .update(translations)
            .set({
              content: title,
              isDefault: isDefault ? 1 : 0,
            })
            .where(eq(translations.uid, existingTitle[0].uid))
        : await trx.insert(translations).values({
            resourceType: 'movie_title',
            resourceUid: movieId,
            languageCode,
            content: title,
            isDefault: isDefault ? 1 : 0,
            createdAt: now,
          }));

      // Add or update description translation if provided
      if (description) {
        const existingDescription = await trx
          .select({uid: translations.uid})
          .from(translations)
          .where(
            and(
              eq(translations.resourceUid, movieId),
              eq(translations.resourceType, 'movie_description'),
              eq(translations.languageCode, languageCode),
            ),
          )
          .limit(1);

        // Update existing description or insert new one
        void (existingDescription.length > 0
          ? await trx
              .update(translations)
              .set({
                content: description,
              })
              .where(eq(translations.uid, existingDescription[0].uid))
          : await trx.insert(translations).values({
              resourceType: 'movie_description',
              resourceUid: movieId,
              languageCode,
              content: description,
              createdAt: now,
            }));
      }
    });

    // Invalidate cache
    await Promise.all(
      getMovieCacheKeysForAllLocales(movieId).map(async key =>
        this.cache.delete(key),
      ),
    );
  }

  async deleteMovieTranslation(
    movieId: string,
    languageCode: string,
    resourceType: 'movie_title' | 'movie_description' = 'movie_title',
  ): Promise<void> {
    await this.database
      .delete(translations)
      .where(
        and(
          eq(translations.resourceUid, movieId),
          eq(translations.resourceType, resourceType),
          eq(translations.languageCode, languageCode),
        ),
      );

    // Invalidate cache
    await Promise.all(
      getMovieCacheKeysForAllLocales(movieId).map(async key =>
        this.cache.delete(key),
      ),
    );
  }
}
