import {and, eq, inArray, isNull, sql} from '@shine/database';
import {articleLinks} from '@shine/database/schema/article-links';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {people} from '@shine/database/schema/people';
import {posterUrls} from '@shine/database/schema/poster-urls';
import {
  awardPageLinkForOrganizationName,
  japaneseAwardNames,
} from './award-definition-lookup';
import {BaseService} from './base-service';
import {loadMovieCredits} from './movie-credits';
import {buildMovieSearchQueries} from './movie-search-query';
import type {MovieSelection, SearchOptions} from '@shine/types';
import {personLocalizedName} from './person-name';

export class MoviesService extends BaseService {
  async searchMovies(options: SearchOptions) {
    const {page, limit} = options;
    const {results, count} = buildMovieSearchQueries(this.database, options);

    const [searchResults, totalCountResult] = await Promise.all([
      results,
      count,
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
    // Get movie with title and description
    const movieQuery = this.database
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

    // Get nominations
    const nominationsQuery = this.database
      .select({
        nominationUid: nominations.uid,
        isWinner: nominations.isWinner,
        specialMention: nominations.specialMention,
        personUid: people.uid,
        personName: people.name,
        personLocalizedName: personLocalizedName(locale),
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
      .leftJoin(people, eq(people.uid, nominations.personUid))
      .where(eq(nominations.movieUid, movieId))
      .orderBy(awardCeremonies.year, awardCategories.name);

    // Get article links
    const articleLinksQuery = this.database
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

    const [movieResult, nominationsData, topArticles, credits] =
      await Promise.all([
        movieQuery,
        nominationsQuery,
        articleLinksQuery,
        loadMovieCredits(this.database, movieId, locale),
      ]);

    if (movieResult.length === 0) {
      throw new Error('Movie not found');
    }

    const movie = movieResult[0];

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
      nominations: nominationsData.map(nom => {
        const japaneseNames =
          locale === 'ja'
            ? japaneseAwardNames(nom.organizationName, nom.categoryName)
            : {};

        return {
          uid: nom.nominationUid,
          isWinner: Boolean(nom.isWinner),
          specialMention: nom.specialMention ?? undefined,
          person: nom.personUid
            ? {
                uid: nom.personUid,
                name: nom.personLocalizedName ?? nom.personName ?? '',
              }
            : undefined,
          category: {
            uid: nom.categoryUid,
            name: nom.categoryName,
            displayName: japaneseNames.category,
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
            displayName: japaneseNames.organization,
            ...awardPageLinkForOrganizationName(
              nom.organizationName,
              nom.categoryName,
            ),
          },
        };
      }),
      articleLinks: topArticles.map(article => ({
        uid: article.uid,
        url: article.url ?? undefined,
        title: article.title ?? undefined,
        description: article.description || undefined,
      })),
      credits,
    };

    return movieDetails;
  }
}
