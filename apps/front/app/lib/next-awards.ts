import type {AwardSummaryData} from './api-types';

const SAME_ORGANIZATION_LIMIT = 6;
const OTHER_ORGANIZATION_LIMIT = 4;

export type NextAwards = {
  sameOrganization: AwardSummaryData[];
  otherOrganizations: AwardSummaryData[];
};

export function nextAwards(
  slug: string,
  awards: AwardSummaryData[],
): NextAwards {
  const current = awards.find(award => award.slug === slug);
  if (!current) {
    return {sameOrganization: [], otherOrganizations: []};
  }

  const sameOrganization = awards
    .filter(
      award =>
        award.organization === current.organization && award.slug !== slug,
    )
    .slice(0, SAME_ORGANIZATION_LIMIT);

  const otherOrganizations = new Map<string, AwardSummaryData>();
  for (const award of awards) {
    if (
      award.organization !== current.organization &&
      award.grouping === current.grouping &&
      !award.subAward &&
      !otherOrganizations.has(award.organization)
    ) {
      otherOrganizations.set(award.organization, award);
    }
  }

  return {
    sameOrganization,
    otherOrganizations: otherOrganizations
      .values()
      .take(OTHER_ORGANIZATION_LIMIT)
      .toArray(),
  };
}
