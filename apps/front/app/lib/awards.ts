export function awardHeading(award: {
  name: string;
  organization: string;
}): string {
  return award.organization === award.name
    ? award.name
    : `${award.organization} ${award.name}`;
}
