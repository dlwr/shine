/**
 * ノミネーションの団体名を投稿用のラベルに変換する。
 * DBの団体名は英語で、APIが locale=ja のときだけ displayName に日本語名を載せる。
 */
export type OrganizationReference = {
  name: string;
  shortName?: string;
  displayName?: string;
};

export function buildOrganizationLabels(
  nominations: Array<{organization: OrganizationReference}>,
): string[] {
  // 同じ団体でも部門ごとに displayName を持つものと持たないものが混ざる。
  // 団体名で束ねてから日本語名に寄せないと同じ団体が二重に出る
  const labelByOrganization = new Map<string, string>();
  for (const {organization} of nominations) {
    const {displayName} = organization;
    const current = labelByOrganization.get(organization.name);

    if (current === undefined) {
      labelByOrganization.set(
        organization.name,
        displayName ?? organization.shortName ?? organization.name,
      );
    } else if (displayName && current !== displayName) {
      labelByOrganization.set(organization.name, displayName);
    }
  }

  return labelByOrganization.values().toArray();
}
