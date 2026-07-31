const ORGANIZATION_SLUGS: Record<string, string> = {
  'Cannes Film Festival': 'palme-dor',
  'Academy Awards': 'academy-best-picture',
  'Japan Academy Awards': 'japan-academy-best-picture',
  '1001 Movies You Must See Before You Die': '1001-movies',
  POPEYE: 'popeye-21st-century',
  BRUTUS: 'brutus-japanese-film',
  Variety: 'variety-top-100',
  TIME: 'time-underappreciated',
  'IGN Japan': 'ign-japan-starter-pack',
};

export function awardSlugForOrganization(
  organizationName: string,
): string | undefined {
  return ORGANIZATION_SLUGS[organizationName];
}
