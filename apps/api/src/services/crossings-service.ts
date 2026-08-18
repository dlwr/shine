import {inArray, isNull, sql} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {awardPageDefinitions, findAwardPageDefinition} from './awards-service';
import {BaseService} from './base-service';
import type {AwardCrossings, CrossingMovie} from '@shine/types';

const DEFAULT_TOP_MOVIE_LIMIT = 24;

function comparePairs(
  a: AwardCrossings['pairs'][number],
  b: AwardCrossings['pairs'][number],
): number {
  return (
    b.shared - a.shared ||
    (a.a === b.a ? a.b.localeCompare(b.b) : a.a.localeCompare(b.a))
  );
}

function compareTopMovies(a: CrossingMovie, b: CrossingMovie): number {
  return (
    b.awardSlugs.length - a.awardSlugs.length ||
    (a.year ?? 0) - (b.year ?? 0) ||
    a.uid.localeCompare(b.uid)
  );
}

export class CrossingsService extends BaseService {
  async getCrossings(options: {limit?: number} = {}): Promise<AwardCrossings> {
    const limit = options.limit ?? DEFAULT_TOP_MOVIE_LIMIT;
    const rows = await this.database
      .selectDistinct({
        movieUid: nominations.movieUid,
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

    const slugsByMovie = new Map<string, Set<string>>();
    for (const row of rows) {
      const slug = findAwardPageDefinition(
        row.organizationName,
        row.categoryName,
      )?.slug;
      if (!slug) {
        continue;
      }

      const slugs = slugsByMovie.get(row.movieUid) ?? new Set<string>();
      slugs.add(slug);
      slugsByMovie.set(row.movieUid, slugs);
    }

    const filmCounts = new Map<string, number>();
    const sharedCounts = new Map<string, AwardCrossings['pairs'][number]>();
    const countsByAwardCount = new Map<number, number>();
    for (const slugSet of slugsByMovie.values()) {
      const slugs = [...slugSet].toSorted();
      for (const slug of slugs) {
        filmCounts.set(slug, (filmCounts.get(slug) ?? 0) + 1);
      }

      for (const [index, a] of slugs.entries()) {
        for (const b of slugs.slice(index + 1)) {
          const key = `${a}::${b}`;
          const pair = sharedCounts.get(key);
          if (pair) {
            pair.shared += 1;
          } else {
            sharedCounts.set(key, {a, b, shared: 1});
          }
        }
      }

      countsByAwardCount.set(
        slugs.length,
        (countsByAwardCount.get(slugs.length) ?? 0) + 1,
      );
    }

    const awards = awardPageDefinitions
      .filter(definition => filmCounts.has(definition.slug))
      .map(definition => ({
        slug: definition.slug,
        name: definition.name,
        shortLabel: definition.shortLabel,
        organization: definition.organization,
        filmCount: filmCounts.get(definition.slug) ?? 0,
      }));

    const pairs = [...sharedCounts.values()].toSorted(comparePairs);

    const distribution = [...countsByAwardCount]
      .map(([awardCount, filmCount]) => ({awardCount, filmCount}))
      .toSorted((a, b) => b.awardCount - a.awardCount);

    return {
      awards,
      pairs,
      distribution,
      topMovies: await this.loadTopMovies(slugsByMovie, limit),
    };
  }

  private async loadTopMovies(
    slugsByMovie: Map<string, Set<string>>,
    limit: number,
  ): Promise<CrossingMovie[]> {
    const movieUids = [...slugsByMovie]
      .toSorted(([, a], [, b]) => b.size - a.size)
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
        awardSlugs: [...(slugsByMovie.get(row.uid) ?? [])].toSorted(),
      }))
      .toSorted(compareTopMovies);
  }
}
