import type {AwardSummaryData} from './api-types';

const SAME_ORGANIZATION_LIMIT = 6;
const OTHER_ORGANIZATION_LIMIT = 4;

const JAPANESE_ORGANIZATIONS = new Set([
  '日本アカデミー賞',
  'キネマ旬報',
  '毎日映画コンクール',
  'ブルーリボン賞',
  '報知映画賞',
  '日刊スポーツ映画大賞',
  'ヨコハマ映画祭',
]);

const PERSON_CATEGORY_SUFFIXES = [
  '-supporting-actress',
  '-supporting-actor',
  '-lead-actress',
  '-lead-actor',
  '-director',
];

export type NextAwards = {
  sameOrganization: AwardSummaryData[];
  otherOrganizations: AwardSummaryData[];
};

function isJapanese(award: AwardSummaryData): boolean {
  return JAPANESE_ORGANIZATIONS.has(award.organization);
}

function personCategoryOf(slug: string): string | undefined {
  return PERSON_CATEGORY_SUFFIXES.find(suffix => slug.endsWith(suffix));
}

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

  const category = personCategoryOf(slug);
  const otherOrganizations = new Map<string, AwardSummaryData>();
  for (const award of awards) {
    if (
      award.organization === current.organization ||
      award.grouping !== current.grouping ||
      award.subAward
    ) {
      continue;
    }

    const chosen = otherOrganizations.get(award.organization);
    if (
      !chosen ||
      (category !== undefined &&
        personCategoryOf(chosen.slug) !== category &&
        personCategoryOf(award.slug) === category)
    ) {
      otherOrganizations.set(award.organization, award);
    }
  }

  return {
    sameOrganization,
    otherOrganizations: otherOrganizations
      .values()
      .toArray()
      .toSorted(
        (a, b) =>
          Number(isJapanese(b) === isJapanese(current)) -
          Number(isJapanese(a) === isJapanese(current)),
      )
      .slice(0, OTHER_ORGANIZATION_LIMIT),
  };
}
