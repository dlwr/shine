import {and, eq, isNull, sql} from '@shine/database';
import {movies} from '@shine/database/schema/movies';
import {fetchAdminMovieDetail} from './admin-movie-detail';
import {BaseService} from './base-service';
import {NotFoundError} from './errors';
import {invalidateMovieCaches} from './movie-cache-invalidation';
import {parseMovieUpdate, type UpdateMovieInput} from './movie-update-input';
import type {PaginationOptions} from '../types/common';

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
    return fetchAdminMovieDetail(this.database, movieId);
  }

  async updateMovie(movieId: string, input: UpdateMovieInput): Promise<void> {
    const movieExists = await this.database
      .select({uid: movies.uid})
      .from(movies)
      .where(and(eq(movies.uid, movieId), isNull(movies.deletedAt)))
      .limit(1);

    if (movieExists.length === 0) {
      throw new NotFoundError('Movie not found');
    }

    const updateData = parseMovieUpdate(input);

    if (Object.keys(updateData).length === 0) {
      return;
    }

    await this.database
      .update(movies)
      .set(updateData)
      .where(eq(movies.uid, movieId));
    await invalidateMovieCaches(this.env, movieId);
  }
}
