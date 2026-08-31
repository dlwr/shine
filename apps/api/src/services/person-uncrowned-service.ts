import {and, eq, inArray, isNotNull, isNull, sql} from '@shine/database';
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
} from './awards-service';
import {BaseService} from './base-service';
import type {
  PersonUncrowned,
  UncrownedPerson,
  UncrownedPersonLoss,
} from '@shine/types';

const DEFAULT_PERSON_LIMIT = 24;

function compareLosses(a: UncrownedPersonLoss, b: UncrownedPersonLoss): number {
  return a.year - b.year || a.slug.localeCompare(b.slug);
}

function compareTopPeople(a: UncrownedPerson, b: UncrownedPerson): number {
  return b.losses.length - a.losses.length || a.uid.localeCompare(b.uid);
}

export class PersonUncrownedService extends BaseService {
  async getPersonUncrowned({
    locale,
    limit = DEFAULT_PERSON_LIMIT,
  }: {
    locale: string;
    limit?: number;
  }): Promise<PersonUncrowned> {
    const rows = await this.database
      .select({
        personUid: sql<string>`${nominations.personUid}`.as('person_uid'),
        isWinner: nominations.isWinner,
        ceremonyYear: awardCeremonies.year,
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
      .where(isNotNull(nominations.personUid));

    const nominatedPeople = new Set<string>();
    const crownedPeople = new Set<string>();
    const lossSlugs = new Set<string>();
    const lossesByPerson = new Map<string, Map<string, UncrownedPersonLoss>>();
    for (const row of rows) {
      const definition = findPersonAwardDefinition(
        row.organizationName,
        row.categoryName,
      );
      if (!definition) {
        continue;
      }

      nominatedPeople.add(row.personUid);
      if (row.isWinner) {
        crownedPeople.add(row.personUid);
        continue;
      }

      lossSlugs.add(definition.slug);
      const losses =
        lossesByPerson.get(row.personUid) ??
        new Map<string, UncrownedPersonLoss>();
      losses.set(`${definition.slug}:${row.ceremonyYear}`, {
        slug: definition.slug,
        year: row.ceremonyYear,
      });
      lossesByPerson.set(row.personUid, losses);
    }

    const uncrowned = new Map(
      [...lossesByPerson].filter(([uid]) => !crownedPeople.has(uid)),
    );

    const awards = personAwardDefinitions
      .filter(definition => lossSlugs.has(definition.slug))
      .map(definition => ({
        slug: definition.slug,
        name: definition.name,
        shortLabel:
          findPersonAwardOrganization(definition.organizationName)
            ?.shortLabel ?? definition.organization,
        organization: definition.organization,
      }));

    return {
      nominatedPersonCount: nominatedPeople.size,
      uncrownedPersonCount: uncrowned.size,
      awards,
      topPeople: await this.loadTopPeople(uncrowned, limit, locale),
    };
  }

  private async loadTopPeople(
    lossesByPerson: Map<string, Map<string, UncrownedPersonLoss>>,
    limit: number,
    locale: string,
  ): Promise<UncrownedPerson[]> {
    const personUids = [...lossesByPerson]
      .toSorted(
        ([uidA, a], [uidB, b]) => b.size - a.size || uidA.localeCompare(uidB),
      )
      .slice(0, limit)
      .map(([uid]) => uid);

    if (personUids.length === 0) {
      return [];
    }

    const rows = await this.database
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
      .where(inArray(people.uid, personUids));

    return rows
      .map(row => ({
        uid: row.uid,
        name: row.localizedName ?? row.name,
        profilePath: row.profilePath ?? undefined,
        losses: [...(lossesByPerson.get(row.uid)?.values() ?? [])].toSorted(
          compareLosses,
        ),
      }))
      .toSorted(compareTopPeople);
  }
}
