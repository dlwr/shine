import {and, eq, isNull, sql, type getDatabase} from '@shine/database';
import {articleLinks} from '@shine/database/schema/article-links';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movieAvailabilityChecks} from '@shine/database/schema/movie-availability-checks';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {people} from '@shine/database/schema/people';
import {posterUrls} from '@shine/database/schema/poster-urls';
import {translations} from '@shine/database/schema/translations';
import {
  awardPageLinkForOrganizationName,
  japaneseAwardNames,
} from './award-definition-lookup';
import type {MovieSelection} from '../types/movies';

type Database = ReturnType<typeof getDatabase>;

export async function loadSelectionMovie(
  database: Database,
  movieId: string,
  locale: string,
): Promise<MovieSelection> {
  // Get movie basic data
  const movieResult = await database
    .select({
      uid: movies.uid,
      year: movies.year,
      originalLanguage: movies.originalLanguage,
      imdbId: movies.imdbId,
      tmdbId: movies.tmdbId,
    })
    .from(movies)
    .where(and(eq(movies.uid, movieId), isNull(movies.deletedAt)))
    .limit(1);

  if (movieResult.length === 0) {
    throw new Error('Movie not found');
  }

  const movie = movieResult[0];

  // Fetch the movie's related data in parallel
  const [
    allTranslations,
    descriptionResult,
    nominationsData,
    posters,
    topArticles,
    availability,
  ] = await Promise.all([
    database
      .select({
        languageCode: translations.languageCode,
        content: translations.content,
        isDefault: translations.isDefault,
        resourceType: translations.resourceType,
      })
      .from(translations)
      .where(
        and(
          eq(translations.resourceUid, movieId),
          eq(translations.resourceType, 'movie_title'),
        ),
      ),
    database
      .select({
        content: translations.content,
      })
      .from(translations)
      .where(
        and(
          eq(translations.resourceUid, movieId),
          eq(translations.resourceType, 'movie_description'),
          eq(translations.languageCode, locale),
        ),
      )
      .limit(1),
    database
      .select({
        nominationUid: nominations.uid,
        isWinner: nominations.isWinner,
        specialMention: nominations.specialMention,
        personUid: people.uid,
        personName: people.name,
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
      .orderBy(awardCeremonies.year, awardCategories.name),
    database
      .select({
        url: posterUrls.url,
        languageCode: posterUrls.languageCode,
        isPrimary: posterUrls.isPrimary,
      })
      .from(posterUrls)
      .where(eq(posterUrls.movieUid, movieId))
      .orderBy(sql`${posterUrls.isPrimary} DESC, ${posterUrls.createdAt} ASC`),
    database
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
      .limit(3),
    loadWatchableAvailability(database, movieId),
  ]);

  const selectedTitle = resolveTitle(allTranslations, locale);
  const description = descriptionResult[0]?.content || undefined;

  // Generate IMDb URL if IMDb ID exists
  const imdbUrl = movie.imdbId
    ? `https://www.imdb.com/title/${movie.imdbId}/`
    : undefined;

  return {
    uid: movie.uid,
    year: movie.year ?? 0,
    originalLanguage: movie.originalLanguage,
    imdbId: movie.imdbId ?? undefined,
    tmdbId: movie.tmdbId ?? undefined,
    title: selectedTitle || `Unknown Title (${movie.year})`,
    description: description || undefined,
    posterUrls: posters.map(p => ({
      url: p.url,
      languageCode: p.languageCode ?? undefined,
      isPrimary: p.isPrimary ?? 0,
    })),
    imdbUrl,
    nominations: nominationsData.map(nom => {
      const japaneseNames =
        locale === 'ja'
          ? japaneseAwardNames(nom.organizationName, nom.categoryName)
          : {};

      return {
        uid: nom.nominationUid,
        isWinner: Boolean(nom.isWinner),
        specialMention: nom.specialMention ?? undefined,
        person:
          nom.personUid && nom.personName
            ? {uid: nom.personUid, name: nom.personName}
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
    availability,
  };
}

async function loadWatchableAvailability(
  database: Database,
  movieId: string,
): Promise<
  Array<{
    source: string;
    detail: string | undefined;
    checkedAt: number;
  }>
> {
  const sourceOrder = ['tmdb', 'unext', 'discas', 'geo'];
  const rows = await database
    .select({
      source: movieAvailabilityChecks.source,
      status: movieAvailabilityChecks.status,
      detail: movieAvailabilityChecks.detail,
      checkedAt: movieAvailabilityChecks.checkedAt,
    })
    .from(movieAvailabilityChecks)
    .where(eq(movieAvailabilityChecks.movieUid, movieId))
    .orderBy(movieAvailabilityChecks.checkedAt);

  // Latest record per source; expose only sources currently judged watchable
  const latestBySource = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    latestBySource.set(row.source, row);
  }

  return sourceOrder
    .map(source => latestBySource.get(source))
    .filter((row): row is NonNullable<typeof row> => row?.status === 'ok')
    .map(row => ({
      source: row.source,
      detail: row.detail ?? undefined,
      checkedAt: row.checkedAt,
    }));
}

function resolveTitle(
  allTranslations: Array<{
    languageCode: string;
    content: string;
    isDefault: number | null;
  }>,
  locale: string,
): string | undefined {
  const languageCode = locale.split('-', 1)[0];

  // Priority-ordered list of matchers: locale match, default, Japanese, English
  const matchers: Array<
    (t: {languageCode: string; isDefault: number | null}) => boolean
  > = [
    t => t.languageCode === languageCode,
    t => t.isDefault === 1,
    t => t.languageCode === 'ja',
    t => t.languageCode === 'en',
  ];

  for (const matcher of matchers) {
    const match = allTranslations.find(t => matcher(t));
    if (match) {
      return match.content;
    }
  }

  // Fallback: first available translation
  return allTranslations[0]?.content;
}
