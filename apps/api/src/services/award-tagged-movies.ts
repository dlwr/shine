import {and, eq, isNull, type Database, type SQL} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import type {AwardLegend, AwardTaggedMovie} from '../types/award-tagged-movies';
import {
  awardPageNominations,
  findTopAwardPageDefinition,
} from './award-definition-lookup';
import {awardPageDefinitions} from './award-definitions';
import {localizedPosterUrl} from './localized-poster-url';
import {movieTitleColumns} from './movie-title-columns';

const slugOrder = new Map(
  awardPageDefinitions.map((definition, index) => [definition.slug, index]),
);

export async function loadAwardTaggedMovies(
  database: Database,
  condition: SQL,
): Promise<{movies: AwardTaggedMovie[]; awards: AwardLegend[]}> {
  const rows = await database
    .select({
      movieUid: movies.uid,
      year: movies.year,
      releaseDate: movies.releaseDate,
      runtime: movies.runtime,
      isWinner: nominations.isWinner,
      organizationName: awardOrganizations.name,
      categoryName: awardCategories.name,
      ...movieTitleColumns(),
      posterUrl: localizedPosterUrl('ja').as('posterUrl'),
    })
    .from(movies)
    .innerJoin(nominations, eq(nominations.movieUid, movies.uid))
    .innerJoin(
      awardCeremonies,
      eq(nominations.ceremonyUid, awardCeremonies.uid),
    )
    .innerJoin(
      awardOrganizations,
      eq(awardCeremonies.organizationUid, awardOrganizations.uid),
    )
    .innerJoin(
      awardCategories,
      eq(nominations.categoryUid, awardCategories.uid),
    )
    .where(and(condition, isNull(movies.deletedAt), awardPageNominations()));

  const byUid = new Map<string, AwardTaggedMovie>();
  for (const row of rows) {
    const slug = findTopAwardPageDefinition(
      row.organizationName,
      row.categoryName,
    )?.slug;
    if (!slug) {
      continue;
    }

    let movie = byUid.get(row.movieUid);
    if (!movie) {
      movie = {
        uid: row.movieUid,
        title: row.jaTitle ?? row.defaultTitle ?? undefined,
        posterUrl: row.posterUrl ?? undefined,
        year: row.year ?? undefined,
        releaseDate: row.releaseDate ?? undefined,
        runtime: row.runtime ?? undefined,
        isWinner: false,
        awards: [],
      };
      byUid.set(row.movieUid, movie);
    }

    const isWinner = row.isWinner === 1;
    movie.isWinner ||= isWinner;

    const award = movie.awards.find(entry => entry.slug === slug);
    if (award) {
      award.isWinner ||= isWinner;
    } else {
      movie.awards.push({slug, isWinner});
    }
  }

  const taggedMovies = byUid.values().toArray();
  for (const movie of taggedMovies) {
    movie.awards.sort(
      (a, b) => (slugOrder.get(a.slug) ?? 0) - (slugOrder.get(b.slug) ?? 0),
    );
  }

  return {movies: taggedMovies, awards: awardLegend(taggedMovies)};
}

export function awardLegend(taggedMovies: AwardTaggedMovie[]): AwardLegend[] {
  const presentSlugs = new Set(
    taggedMovies.flatMap(movie => movie.awards.map(award => award.slug)),
  );
  return awardPageDefinitions
    .filter(definition => presentSlugs.has(definition.slug))
    .map(definition => ({
      slug: definition.slug,
      shortLabel: definition.shortLabel,
      name: definition.name,
      organization: definition.organization,
    }));
}
