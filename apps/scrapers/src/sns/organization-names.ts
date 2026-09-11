/**
 * ノミネーションの団体名を投稿用のラベルに変換する。
 * DBの団体名は英語なので、賞ページ(/awards)の slug から日本語名へ寄せる。
 */
export type OrganizationReference = {
  name: string;
  shortName?: string;
  slug?: string;
};

export type AwardPageSummary = {
  slug: string;
  organization: string;
};

export function buildOrganizationLabels(
  nominations: Array<{organization: OrganizationReference}>,
  awards: AwardPageSummary[],
): string[] {
  const japaneseBySlug = new Map(
    awards.map(award => [award.slug, award.organization]),
  );

  // 同じ団体でも部門ごとに slug が違い、賞ページを持つ部門と持たない部門が
  // 混ざる。団体名で束ねてから日本語名に寄せないと同じ団体が二重に出る
  const labelByOrganization = new Map<string, string>();
  for (const {organization} of nominations) {
    const japanese = organization.slug
      ? japaneseBySlug.get(organization.slug)
      : undefined;
    const current = labelByOrganization.get(organization.name);

    if (current === undefined) {
      labelByOrganization.set(
        organization.name,
        japanese ?? organization.shortName ?? organization.name,
      );
    } else if (japanese && current !== japanese) {
      labelByOrganization.set(organization.name, japanese);
    }
  }

  return labelByOrganization.values().toArray();
}
