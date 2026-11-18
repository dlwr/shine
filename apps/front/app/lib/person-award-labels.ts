const ORGANIZATION_SHORT_LABELS = new Map([
  ['アカデミー賞', 'アカデミー'],
  ['英国アカデミー賞', 'BAFTA'],
  ['ゴールデングローブ賞', 'GG'],
  ['カンヌ国際映画祭', 'カンヌ'],
  ['ヴェネツィア国際映画祭', 'ヴェネツィア'],
  ['ベルリン国際映画祭', 'ベルリン'],
  ['日本アカデミー賞', '日本 アカデミー'],
  ['キネマ旬報', 'キネ旬'],
  ['毎日映画コンクール', '毎日'],
  ['ブルーリボン賞', 'ブルーリボン'],
  ['報知映画賞', '報知'],
  ['ヨコハマ映画祭', 'ヨコハマ'],
  ['日刊スポーツ映画大賞', '日刊'],
]);

const CATEGORY_LABELS = ['助演', '主演', '監督', '男優', '女優'];

export function categoryLabel(category: string): string {
  return (
    CATEGORY_LABELS.find(label => category.includes(label)) ??
    category.replace(/（.*）/, '').replace(/賞$/, '')
  );
}

export function organizationShortLabel(organization: string): string {
  return ORGANIZATION_SHORT_LABELS.get(organization) ?? organization;
}

export function organizationRank(organization: string): number {
  const rank = ORGANIZATION_SHORT_LABELS.keys().toArray().indexOf(organization);
  return rank === -1 ? Infinity : rank;
}

export function personAwardLabel(award: {
  organization: string;
  category: string;
}): string {
  return `${organizationShortLabel(award.organization).replace(' ', '')} ${categoryLabel(award.category)}`;
}

export function byOrganizationRank<T extends {organization: string}>(
  a: T,
  b: T,
): number {
  return organizationRank(a.organization) - organizationRank(b.organization);
}
