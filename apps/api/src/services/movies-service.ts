import {and, eq, isNull, like, sql} from '@shine/database';
import {articleLinks} from '@shine/database/schema/article-links';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {translations} from '@shine/database/schema/translations';
import {EdgeCache, getCacheKeyForMovie} from '../utils/cache';
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
      conditions.push(like(translations.content, `%${query}%`));
    }

    if (year && !Number.isNaN(Number(year))) {
      conditions.push(eq(movies.year, Number(year)));
    }

    if (language) {
      conditions.push(eq(movies.originalLanguage, language));
    }

    // Base query with movie and translation data
    const baseQuery = this.database
      .select({
        uid: movies.uid,
        year: movies.year,
        originalLanguage: movies.originalLanguage,
        imdbId: movies.imdbId,
        title: translations.content,
        posterUrl: sql`
					(
					  SELECT url
					  FROM poster_urls
					  WHERE poster_urls.movie_uid = movies.uid
					  ORDER BY poster_urls.is_primary DESC, poster_urls.created_at ASC
					  LIMIT 1
					)
				`.as('posterUrl'),
        hasNominations: sql`
					(
					  SELECT COUNT(*) > 0
					  FROM nominations
					  WHERE nominations.movie_uid = movies.uid
					)
				`.as('hasNominations'),
      })
      .from(movies)
      .leftJoin(
        translations,
        and(
          eq(translations.resourceUid, movies.uid),
          eq(translations.resourceType, 'movie_title'),
          eq(translations.languageCode, 'ja'),
        ),
      );

    type BaseQuery = typeof baseQuery;
    type SearchResultRow = Awaited<ReturnType<BaseQuery['execute']>>[number];

    // Build final query with conditions
    const finalQuery = (() => {
      if (String(hasAwards) === 'true') {
        // Join nominations for awards filter
        const joined = baseQuery.innerJoin(
          nominations,
          eq(nominations.movieUid, movies.uid),
        );

        const filtered =
          conditions.length > 0 ? joined.where(and(...conditions)) : joined;

        return filtered.groupBy(movies.uid, translations.content);
      }

      if (conditions.length > 0) {
        return baseQuery.where(and(...conditions));
      }

      return baseQuery;
    })();

    // Get movies with pagination
    const searchResults: SearchResultRow[] = await finalQuery
      .orderBy(movies.year, movies.uid)
      .limit(limit)
      .offset(offset);

    // Get total count with simple separate query
    const baseCountQuery = this.database
      .select({count: sql`COUNT(DISTINCT movies.uid)`.as('count')})
      .from(movies)
      .leftJoin(
        translations,
        and(
          eq(translations.resourceUid, movies.uid),
          eq(translations.resourceType, 'movie_title'),
          eq(translations.languageCode, 'ja'),
        ),
      );

    // Build count query
    const countQuery = (() => {
      const withAwards =
        String(hasAwards) === 'true'
          ? baseCountQuery.innerJoin(
              nominations,
              eq(nominations.movieUid, movies.uid),
            )
          : baseCountQuery;

      return conditions.length > 0
        ? withAwards.where(and(...conditions))
        : withAwards;
    })();

    const totalCountResult = await countQuery;
    const totalCount = Number(totalCountResult[0]?.count) || 0;
    const totalPages = Math.ceil(totalCount / limit);

    return {
      movies: searchResults.map(movie => ({
        uid: movie.uid,
        year: movie.year ?? undefined,
        originalLanguage: movie.originalLanguage,
        imdbId: movie.imdbId ?? undefined,
        title:
          movie.title ??
          (movie.year ? `Unknown Title (${movie.year})` : 'Unknown Title'),
        posterUrl: movie.posterUrl,
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
    const cacheKey = getCacheKeyForMovie(movieId);

    // Try to get cached result
    const cached = await this.cache.get(cacheKey);
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
        title: translations.content,
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
      .leftJoin(
        translations,
        and(
          eq(translations.resourceUid, movies.uid),
          eq(translations.resourceType, 'movie_title'),
          eq(translations.languageCode, locale),
        ),
      )
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
    const response = Response.json(movieDetails, {
      headers: {'Content-Type': 'application/json'},
    });
    await this.cache.put(cacheKey, response);

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
          .set({isDefault: 0, updatedAt: now})
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
              updatedAt: now,
            })
            .where(eq(translations.uid, existingTitle[0].uid))
        : await trx.insert(translations).values({
            resourceType: 'movie_title',
            resourceUid: movieId,
            languageCode,
            content: title,
            isDefault: isDefault ? 1 : 0,
            createdAt: now,
            updatedAt: now,
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
                updatedAt: now,
              })
              .where(eq(translations.uid, existingDescription[0].uid))
          : await trx.insert(translations).values({
              resourceType: 'movie_description',
              resourceUid: movieId,
              languageCode,
              content: description,
              createdAt: now,
              updatedAt: now,
            }));
      }
    });

    // Invalidate cache
    const cacheKey = getCacheKeyForMovie(movieId);
    await this.cache.delete(cacheKey);
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
    const cacheKey = getCacheKeyForMovie(movieId);
    await this.cache.delete(cacheKey);
  }
}
