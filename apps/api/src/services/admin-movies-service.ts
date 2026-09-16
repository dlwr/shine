import {and, eq, isNull, sql} from '@shine/database';
import {articleLinks} from '@shine/database/schema/article-links';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {posterUrls} from '@shine/database/schema/poster-urls';
import {translations} from '@shine/database/schema/translations';
import {BaseService} from './base-service';
import {NotFoundError, ValidationError} from './errors';
import {invalidateMovieCaches} from './movie-cache-invalidation';
import type {PaginationOptions} from '../types/services';

export type UpdateMovieInput = {
  year?: unknown;
  originalLanguage?: unknown;
  mediaType?: unknown;
};

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

export class AdminMoviesService extends BaseService {
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

    const searchCondition = and(
      isNull(movies.deletedAt),
      search
        ? sql`
				EXISTS (
					SELECT 1 FROM translations
					WHERE translations.resource_uid = movies.uid
					AND translations.resource_type = 'movie_title'
					AND translations.content LIKE ${`%${search}%`}
				)
			`
        : undefined,
    );

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
      .where(and(eq(movies.uid, movieId), isNull(movies.deletedAt)))
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
        isOwnerSubmission: articleLinks.isOwnerSubmission,
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

  async updateMovie(movieId: string, input: UpdateMovieInput): Promise<void> {
    const {year, originalLanguage, mediaType} = input;

    const movieExists = await this.database
      .select({uid: movies.uid})
      .from(movies)
      .where(and(eq(movies.uid, movieId), isNull(movies.deletedAt)))
      .limit(1);

    if (movieExists.length === 0) {
      throw new NotFoundError('Movie not found');
    }

    const updateData: Partial<typeof movies.$inferInsert> = {};

    if (year !== undefined) {
      if (
        typeof year !== 'number' ||
        !Number.isSafeInteger(year) ||
        year < 1888 ||
        year > 2100
      ) {
        throw new ValidationError(
          'Year must be a valid integer between 1888 and 2100',
        );
      }

      updateData.year = year;
    }

    if (originalLanguage !== undefined) {
      if (!originalLanguage) {
        updateData.originalLanguage = 'en';
      } else if (typeof originalLanguage !== 'string') {
        throw new ValidationError('Original language must be a string');
      } else if (originalLanguage.length === 2) {
        updateData.originalLanguage = originalLanguage;
      } else {
        throw new ValidationError(
          'Original language must be a 2-letter ISO 639-1 code',
        );
      }
    }

    if (mediaType !== undefined) {
      if (mediaType !== 'movie' && mediaType !== 'tv') {
        throw new ValidationError("mediaType must be 'movie' or 'tv'");
      }

      updateData.mediaType = mediaType;
    }

    if (Object.keys(updateData).length === 0) {
      return;
    }

    await this.database
      .update(movies)
      .set(updateData)
      .where(eq(movies.uid, movieId));
    await invalidateMovieCaches(this.env, movieId);
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

  async setArticleLinkOwner(
    articleId: string,
    isOwnerSubmission: boolean,
  ): Promise<string | undefined> {
    const updated = await this.database
      .update(articleLinks)
      .set({isOwnerSubmission})
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
}
