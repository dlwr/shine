import {and, eq, or, sql, stringLiteral} from '@shine/database';
import {awardCategories} from '@shine/database/schema/award-categories';
import {awardOrganizations} from '@shine/database/schema/award-organizations';
import {
  awardPageDefinitions,
  personAwardDefinitions,
  personAwardOrganizations,
  type AwardPageDefinition,
  type PersonAwardDefinition,
  type PersonAwardOrganization,
} from './award-definitions';

export function findAwardPageDefinition(
  organizationName: string,
  categoryName?: string,
): AwardPageDefinition | undefined {
  const candidates = awardPageDefinitions.filter(
    entry => entry.organizationName === organizationName,
  );

  return categoryName === undefined
    ? candidates.length === 1
      ? candidates[0]
      : undefined
    : candidates.find(entry => entry.categoryNames.includes(categoryName));
}

/** 作品を横断して数える集計（/years・crossings・uncrowned）に使う最高賞の賞ページ */
export function findTopAwardPageDefinition(
  organizationName: string,
  categoryName: string,
): AwardPageDefinition | undefined {
  const definition = findAwardPageDefinition(organizationName, categoryName);
  return definition?.subAward ? undefined : definition;
}

export function awardPageLinkForOrganizationName(
  organizationName: string,
  categoryName?: string,
): {
  slug: string | undefined;
  hasYearPages: boolean;
} {
  const definition = findAwardPageDefinition(organizationName, categoryName);

  return {
    slug: definition?.slug,
    hasYearPages: definition?.grouping === 'year',
  };
}

const categoryNameIn = (names: readonly string[]) =>
  sql`${awardCategories.name} IN (${sql.join(
    names.map(name => stringLiteral(name)),
    sql`, `,
  )})`;

/** 最高賞の賞ページを持つ (組織, 部門) だけに絞る条件。個人賞や映画祭のサブ賞は含まない */
export function awardPageNominations() {
  return or(
    ...awardPageDefinitions
      .filter(definition => !definition.subAward)
      .map(definition =>
        and(
          eq(
            awardOrganizations.name,
            stringLiteral(definition.organizationName),
          ),
          categoryNameIn(definition.categoryNames),
        ),
      ),
  );
}

export function japaneseOrganizationName(
  organizationName: string,
): string | undefined {
  return awardPageDefinitions.find(
    entry => entry.organizationName === organizationName,
  )?.organization;
}

export function japaneseAwardNames(
  organizationName: string,
  categoryName: string,
): {organization?: string; category?: string} {
  const definition = findAwardPageDefinition(organizationName, categoryName);
  if (!definition) {
    const personDefinition = findPersonAwardDefinition(
      organizationName,
      categoryName,
    );
    if (personDefinition) {
      return {
        organization: personDefinition.organization,
        ...(personDefinition.categoryLabel && {
          category: personDefinition.categoryLabel,
        }),
      };
    }

    // 賞ページを持たない部門でも組織名だけは日本語にできる
    const organization = japaneseOrganizationName(organizationName);
    return organization ? {organization} : {};
  }

  // 複数カテゴリを束ねるページの name はページ名なので、カテゴリ名には使えない
  return definition.categoryNames.length === 1
    ? {organization: definition.organization, category: definition.name}
    : {organization: definition.organization};
}

export function findPersonAwardDefinition(
  organizationName: string,
  categoryName: string,
): PersonAwardDefinition | undefined {
  return personAwardDefinitions.find(
    entry =>
      entry.organizationName === organizationName &&
      entry.categoryNames.includes(categoryName),
  );
}

/** 個人賞の (組織, 部門) を役割で絞る条件 */
export function personAwardNominations(role?: PersonAwardDefinition['role']) {
  return or(
    ...personAwardDefinitions
      .filter(definition => role === undefined || definition.role === role)
      .map(definition =>
        and(
          eq(
            awardOrganizations.name,
            stringLiteral(definition.organizationName),
          ),
          categoryNameIn(definition.categoryNames),
        ),
      ),
  );
}

export function findPersonAwardOrganization(
  organizationName: string,
): PersonAwardOrganization | undefined {
  return personAwardOrganizations.find(
    entry => entry.organizationName === organizationName,
  );
}
