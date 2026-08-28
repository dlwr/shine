import {and, eq, inArray, isNull, not, sql} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import {people} from '@shine/database/schema/people';
import {translations} from '@shine/database/schema/translations';
import {
  findPersonAwardDefinition,
  findPersonAwardOrganization,
  personAwardDefinitions,
  personAwardOrganizations,
  type PersonAwardDefinition,
} from './awards-service';
import {BaseService} from './base-service';
import type {PersonCrossingPerformance, PersonCrossings} from '@shine/types';

const DEFAULT_TOP_PERFORMANCE_LIMIT = 48;

type Performance = {
  personUid: string;
  movieUid: string;
  year: number | undefined;
  awards: Map<PersonAwardDefinition, string>;
  organizationKeys: string[];
};

const definitionOrder = new Map(
  personAwardDefinitions.map((definition, index) => [definition, index]),
);

function comparePairs(
  a: PersonCrossings['pairs'][number],
  b: PersonCrossings['pairs'][number],
): number {
  return (
    b.shared - a.shared ||
    (a.a === b.a ? a.b.localeCompare(b.b) : a.a.localeCompare(b.a))
  );
}

function comparePerformances(a: Performance, b: Performance): number {
  return (
    b.organizationKeys.length - a.organizationKeys.length ||
    (b.year ?? 0) - (a.year ?? 0) ||
    a.personUid.localeCompare(b.personUid) ||
    a.movieUid.localeCompare(b.movieUid)
  );
}

export class PersonCrossingsService extends BaseService {
  async getPersonCrossings({
    locale,
    limit = DEFAULT_TOP_PERFORMANCE_LIMIT,
  }: {
    locale: string;
    limit?: number;
  }): Promise<PersonCrossings> {
    const performances = await this.loadPerformances();

    const performanceCounts = new Map<string, number>();
    const sharedCounts = new Map<string, PersonCrossings['pairs'][number]>();
    const countsByOrganizationCount = new Map<number, number>();
    for (const performance of performances) {
      const keys = performance.organizationKeys;
      for (const key of keys) {
        performanceCounts.set(key, (performanceCounts.get(key) ?? 0) + 1);
      }

      for (const [index, a] of keys.entries()) {
        const laterKeys = keys.slice(index + 1);
        for (const b of laterKeys) {
          const pairKey = `${a}::${b}`;
          const pair = sharedCounts.get(pairKey);
          if (pair) {
            pair.shared += 1;
          } else {
            sharedCounts.set(pairKey, {a, b, shared: 1});
          }
        }
      }

      countsByOrganizationCount.set(
        keys.length,
        (countsByOrganizationCount.get(keys.length) ?? 0) + 1,
      );
    }

    const organizations = personAwardOrganizations
      .filter(organization => performanceCounts.has(organization.key))
      .map(organization => ({
        key: organization.key,
        name:
          personAwardDefinitions.find(
            definition =>
              definition.organizationName === organization.organizationName,
          )?.organization ?? organization.organizationName,
        shortLabel: organization.shortLabel,
        performanceCount: performanceCounts.get(organization.key) ?? 0,
      }));

    const pairs = sharedCounts.values().toArray().toSorted(comparePairs);

    const distribution = [...countsByOrganizationCount]
      .map(([organizationCount, performanceCount]) => ({
        organizationCount,
        performanceCount,
      }))
      .toSorted((a, b) => b.organizationCount - a.organizationCount);

    return {
      organizations,
      pairs,
      distribution,
      topPerformances: await this.loadTopPerformances(
        performances.toSorted(comparePerformances).slice(0, limit),
        locale,
      ),
    };
  }

  private async loadPerformances(): Promise<Performance[]> {
    const rows = await this.database
      .selectDistinct({
        personUid: sql<string>`${nominations.personUid}`,
        movieUid: nominations.movieUid,
        year: movies.year,
        organizationName: awardOrganizations.name,
        categoryName: awardCategories.name,
      })
      .from(nominations)
      .innerJoin(
        awardCeremonies,
        eq(awardCeremonies.uid, nominations.ceremonyUid),
      )
      .innerJoin(
        awardOrganizations,
        eq(awardOrganizations.uid, awardCeremonies.organizationUid),
      )
      .innerJoin(
        awardCategories,
        eq(awardCategories.uid, nominations.categoryUid),
      )
      .innerJoin(
        movies,
        and(eq(movies.uid, nominations.movieUid), isNull(movies.deletedAt)),
      )
      .where(
        and(not(isNull(nominations.personUid)), eq(nominations.isWinner, 1)),
      );

    const byPerformance = new Map<string, Performance>();
    for (const row of rows) {
      const definition = findPersonAwardDefinition(
        row.organizationName,
        row.categoryName,
      );
      const organization = findPersonAwardOrganization(row.organizationName);
      if (!definition || !organization) {
        continue;
      }

      const key = `${row.personUid}::${row.movieUid}`;
      const performance = byPerformance.get(key) ?? {
        personUid: row.personUid,
        movieUid: row.movieUid,
        year: row.year ?? undefined,
        awards: new Map<PersonAwardDefinition, string>(),
        organizationKeys: [],
      };
      if (!performance.awards.has(definition)) {
        performance.awards.set(definition, row.categoryName);
      }

      if (!performance.organizationKeys.includes(organization.key)) {
        performance.organizationKeys.push(organization.key);
      }

      byPerformance.set(key, performance);
    }

    for (const performance of byPerformance.values()) {
      performance.organizationKeys.sort((a, b) => a.localeCompare(b));
    }

    return byPerformance.values().toArray();
  }

  private async loadTopPerformances(
    performances: Performance[],
    locale: string,
  ): Promise<PersonCrossingPerformance[]> {
    if (performances.length === 0) {
      return [];
    }

    const [personRows, movieRows] = await Promise.all([
      this.database
        .select({
          uid: people.uid,
          name: people.name,
          profilePath: people.profilePath,
          localizedName: translations.content,
        })
        .from(people)
        .leftJoin(
          translations,
          and(
            eq(translations.resourceUid, people.uid),
            eq(translations.resourceType, 'person_name'),
            eq(translations.languageCode, locale),
          ),
        )
        .where(
          inArray(
            people.uid,
            performances.map(performance => performance.personUid),
          ),
        ),
      this.database
        .select({
          uid: movies.uid,
          title: sql<string | null>`(
            SELECT content FROM translations
            WHERE translations.resource_uid = movies.uid
              AND translations.resource_type = 'movie_title'
            ORDER BY (translations.language_code = ${locale}) DESC,
              translations.is_default DESC,
              (translations.language_code = 'en') DESC
            LIMIT 1
          )`.as('title'),
          posterUrl: sql<string | null>`(
            SELECT url FROM poster_urls
            WHERE poster_urls.movie_uid = movies.uid
            ORDER BY poster_urls.is_primary DESC
            LIMIT 1
          )`.as('posterUrl'),
        })
        .from(movies)
        .where(
          inArray(
            movies.uid,
            performances.map(performance => performance.movieUid),
          ),
        ),
    ]);

    const persons = new Map(personRows.map(row => [row.uid, row]));
    const movieDetails = new Map(movieRows.map(row => [row.uid, row]));

    return performances.map(performance => {
      const person = persons.get(performance.personUid);
      const movie = movieDetails.get(performance.movieUid);
      return {
        person: {
          uid: performance.personUid,
          name: person?.localizedName ?? person?.name ?? '',
          profilePath: person?.profilePath ?? undefined,
        },
        movie: {
          uid: performance.movieUid,
          title: movie?.title ?? undefined,
          year: performance.year,
          posterUrl: movie?.posterUrl ?? undefined,
        },
        awards: [...performance.awards]
          .toSorted(
            ([a], [b]) =>
              (definitionOrder.get(a) ?? 0) - (definitionOrder.get(b) ?? 0),
          )
          .map(([definition, categoryName]) => ({
            slug: definition.slug,
            organization: definition.organization,
            category: definition.categoryLabel ?? categoryName,
          })),
        organizationCount: performance.organizationKeys.length,
      };
    });
  }
}
