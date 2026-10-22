import {and, eq, isNull, sql} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {
  awardPageNominations,
  findTopAwardPageDefinition,
} from './award-definition-lookup';
import {awardPageDefinitions} from './award-definitions';
import {BaseService} from './base-service';
import type {OnThisDay, OnThisDayMovie} from '../types/on-this-day';
import {localizedPosterUrl} from './localized-poster-url';
import {movieTitleColumns} from './movie-title-columns';

function compareMovies(a: OnThisDayMovie, b: OnThisDayMovie): number {
  return (
    a.releaseDate.localeCompare(b.releaseDate) || a.uid.localeCompare(b.uid)
  );
}

export class OnThisDayService extends BaseService {
  async getOnThisDay(monthDay: string): Promise<OnThisDay> {
    const rows = await this.database
      .select({
        movieUid: movies.uid,
        releaseDate: movies.releaseDate,
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
      .where(
        and(
          sql`substr(${movies.releaseDate}, 6, 5) = ${monthDay}`,
          isNull(movies.deletedAt),
          awardPageNominations(),
        ),
      );

    const byUid = new Map<string, OnThisDayMovie>();
    for (const row of rows) {
      const slug = findTopAwardPageDefinition(
        row.organizationName,
        row.categoryName,
      )?.slug;
      if (!slug || !row.releaseDate) {
        continue;
      }

      let movie = byUid.get(row.movieUid);
      if (!movie) {
        movie = {
          uid: row.movieUid,
          title: row.jaTitle ?? row.defaultTitle ?? undefined,
          posterUrl: row.posterUrl ?? undefined,
          releaseDate: row.releaseDate,
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

    const slugOrder = new Map(
      awardPageDefinitions.map((definition, index) => [definition.slug, index]),
    );
    const movieEntries = byUid.values().toArray().toSorted(compareMovies);
    for (const movie of movieEntries) {
      movie.awards.sort(
        (a, b) => (slugOrder.get(a.slug) ?? 0) - (slugOrder.get(b.slug) ?? 0),
      );
    }

    const presentSlugs = new Set(
      movieEntries.flatMap(movie => movie.awards.map(award => award.slug)),
    );

    return {
      monthDay,
      movies: movieEntries,
      awards: awardPageDefinitions
        .filter(definition => presentSlugs.has(definition.slug))
        .map(definition => ({
          slug: definition.slug,
          shortLabel: definition.shortLabel,
          name: definition.name,
          organization: definition.organization,
        })),
    };
  }
}
