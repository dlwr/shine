import {inArray, isNull, sql} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {
  awardPageDefinitions,
  findTopAwardPageDefinition,
} from './awards-service';
import {BaseService} from './base-service';
import type {Uncrowned, UncrownedLoss, UncrownedMovie} from '@shine/types';

const DEFAULT_MOVIE_LIMIT = 24;

function compareLosses(a: UncrownedLoss, b: UncrownedLoss): number {
  return a.year - b.year || a.slug.localeCompare(b.slug);
}

function compareTopMovies(a: UncrownedMovie, b: UncrownedMovie): number {
  return (
    b.losses.length - a.losses.length ||
    (a.year ?? 0) - (b.year ?? 0) ||
    a.uid.localeCompare(b.uid)
  );
}

export class UncrownedService extends BaseService {
  async getUncrowned(options: {limit?: number} = {}): Promise<Uncrowned> {
    const limit = options.limit ?? DEFAULT_MOVIE_LIMIT;
    const rows = await this.database
      .select({
        movieUid: nominations.movieUid,
        isWinner: nominations.isWinner,
        ceremonyYear: awardCeremonies.year,
        organizationName: awardOrganizations.name,
        categoryName: awardCategories.name,
      })
      .from(nominations)
      .innerJoin(
        awardCeremonies,
        sql`${awardCeremonies.uid} = ${nominations.ceremonyUid}`,
      )
      .innerJoin(
        awardOrganizations,
        sql`${awardOrganizations.uid} = ${awardCeremonies.organizationUid}`,
      )
      .innerJoin(
        awardCategories,
        sql`${awardCategories.uid} = ${nominations.categoryUid}`,
      )
      .innerJoin(movies, sql`${movies.uid} = ${nominations.movieUid}`)
      .where(isNull(movies.deletedAt));

    const nominatedMovies = new Set<string>();
    const crownedMovies = new Set<string>();
    const lossSlugs = new Set<string>();
    const lossesByMovie = new Map<string, Map<string, UncrownedLoss>>();
    for (const row of rows) {
      const definition = findTopAwardPageDefinition(
        row.organizationName,
        row.categoryName,
      );
      if (definition?.grouping !== 'year') {
        continue;
      }

      nominatedMovies.add(row.movieUid);
      if (row.isWinner) {
        crownedMovies.add(row.movieUid);
        continue;
      }

      lossSlugs.add(definition.slug);
      const losses =
        lossesByMovie.get(row.movieUid) ?? new Map<string, UncrownedLoss>();
      losses.set(`${definition.slug}:${row.ceremonyYear}`, {
        slug: definition.slug,
        year: row.ceremonyYear,
      });
      lossesByMovie.set(row.movieUid, losses);
    }

    const uncrowned = new Map(
      [...lossesByMovie].filter(([uid]) => !crownedMovies.has(uid)),
    );

    const awards = awardPageDefinitions
      .filter(
        definition =>
          definition.grouping === 'year' && lossSlugs.has(definition.slug),
      )
      .map(definition => ({
        slug: definition.slug,
        name: definition.name,
        shortLabel: definition.shortLabel,
        organization: definition.organization,
      }));

    return {
      nominatedFilmCount: nominatedMovies.size,
      uncrownedFilmCount: uncrowned.size,
      awards,
      topMovies: await this.loadTopMovies(uncrowned, limit),
    };
  }

  private async loadTopMovies(
    lossesByMovie: Map<string, Map<string, UncrownedLoss>>,
    limit: number,
  ): Promise<UncrownedMovie[]> {
    const movieUids = [...lossesByMovie]
      .toSorted(
        ([uidA, a], [uidB, b]) => b.size - a.size || uidA.localeCompare(uidB),
      )
      .slice(0, limit)
      .map(([uid]) => uid);

    if (movieUids.length === 0) {
      return [];
    }

    const rows = await this.database
      .select({
        uid: movies.uid,
        year: movies.year,
        jaTitle: sql<string | null>`(
          SELECT content FROM translations
          WHERE translations.resource_uid = movies.uid
            AND translations.resource_type = 'movie_title'
            AND translations.language_code = 'ja'
          LIMIT 1
        )`.as('jaTitle'),
        defaultTitle: sql<string | null>`(
          SELECT content FROM translations
          WHERE translations.resource_uid = movies.uid
            AND translations.resource_type = 'movie_title'
          ORDER BY translations.is_default DESC
          LIMIT 1
        )`.as('defaultTitle'),
        posterUrl: sql<string | null>`(
          SELECT url FROM poster_urls
          WHERE poster_urls.movie_uid = movies.uid
          ORDER BY poster_urls.is_primary DESC
          LIMIT 1
        )`.as('posterUrl'),
      })
      .from(movies)
      .where(inArray(movies.uid, movieUids));

    return rows
      .map(row => ({
        uid: row.uid,
        title: row.jaTitle ?? row.defaultTitle ?? undefined,
        year: row.year ?? undefined,
        posterUrl: row.posterUrl ?? undefined,
        losses: [...(lossesByMovie.get(row.uid)?.values() ?? [])].toSorted(
          compareLosses,
        ),
      }))
      .toSorted(compareTopMovies);
  }
}
