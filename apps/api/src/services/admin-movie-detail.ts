import {and, eq, isNull, sql, type getDatabase} from '@shine/database';
import {articleLinks} from '@shine/database/schema/article-links';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {posterUrls} from '@shine/database/schema/poster-urls';
import {translations} from '@shine/database/schema/translations';
import {NotFoundError} from './errors';

export async function fetchAdminMovieDetail(
  database: ReturnType<typeof getDatabase>,
  movieId: string,
) {
  const movieResult = await database
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

  const translationsResult = await database
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

  const postersResult = await database
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

  const nominationsResult = await database
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

  const articleLinksResult = await database
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
