import {and, eq, inArray, isNull, sql} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardCeremonies} from '@shine/database/schema/award-ceremonies';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {movies} from '@shine/database/schema/movies';
import {nominations} from '@shine/database/schema/nominations';
import type {getDatabase} from '@shine/database';
import type {AwardSummary} from '../types/awards';
import type {
  AwardPageDefinition,
  PersonAwardDefinition,
} from './award-definitions';

type Database = ReturnType<typeof getDatabase>;

export type CategorySelector = {
  organizationName: string;
  categoryNames: string[];
};

export function movieTitleColumns() {
  return {
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
  };
}

export async function resolveCategoryUids(
  database: Database,
  definition: CategorySelector,
): Promise<string[]> {
  const rows = await database
    .select({uid: awardCategories.uid})
    .from(awardCategories)
    .innerJoin(
      awardOrganizations,
      eq(awardCategories.organizationUid, awardOrganizations.uid),
    )
    .where(
      and(
        eq(awardOrganizations.name, definition.organizationName),
        inArray(awardCategories.name, definition.categoryNames),
      ),
    );
  return rows.map(row => row.uid);
}

export async function summarizeAward(
  database: Database,
  definition: AwardPageDefinition | PersonAwardDefinition,
  grouping: AwardSummary['grouping'],
): Promise<AwardSummary | undefined> {
  const categoryUids = await resolveCategoryUids(database, definition);
  if (categoryUids.length === 0) {
    return undefined;
  }

  const [aggregate] = await database
    .select({
      movieCount: sql<number>`COUNT(DISTINCT ${nominations.movieUid})`,
      personCount: sql<number>`COUNT(DISTINCT ${nominations.personUid})`,
      firstYear: sql<number | null>`MIN(${awardCeremonies.year})`,
      lastYear: sql<number | null>`MAX(${awardCeremonies.year})`,
    })
    .from(nominations)
    .innerJoin(
      awardCeremonies,
      eq(nominations.ceremonyUid, awardCeremonies.uid),
    )
    .innerJoin(movies, eq(nominations.movieUid, movies.uid))
    .where(
      and(
        inArray(nominations.categoryUid, categoryUids),
        isNull(movies.deletedAt),
      ),
    );

  if (
    !aggregate ||
    aggregate.movieCount === 0 ||
    aggregate.firstYear === null ||
    aggregate.lastYear === null
  ) {
    return undefined;
  }

  return {
    slug: definition.slug,
    name: definition.name,
    organization: definition.organization,
    description: definition.description,
    grouping,
    movieCount: aggregate.movieCount,
    ...(grouping === 'person' && {personCount: aggregate.personCount}),
    ...('subAward' in definition && definition.subAward && {subAward: true}),
    firstYear: aggregate.firstYear,
    lastYear: aggregate.lastYear,
  };
}
