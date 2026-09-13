import type {AwardsCategory, AwardsCeremony, AwardsOrganization} from './types';

export const sortCeremoniesByYearDesc = (ceremonies: AwardsCeremony[]) => {
  const sorted: AwardsCeremony[] = [];
  for (const ceremony of ceremonies) {
    const insertIndex = sorted.findIndex(
      current => current.year < ceremony.year,
    );
    if (insertIndex === -1) {
      sorted.push(ceremony);
    } else {
      sorted.splice(insertIndex, 0, ceremony);
    }
  }
  return sorted;
};

export const sortCategoriesByName = (categories: AwardsCategory[]) => {
  const sorted: AwardsCategory[] = [];
  for (const category of categories) {
    const insertIndex = sorted.findIndex(
      current => current.name.localeCompare(category.name, 'ja') > 0,
    );
    if (insertIndex === -1) {
      sorted.push(category);
    } else {
      sorted.splice(insertIndex, 0, category);
    }
  }
  return sorted;
};

export const formatOrganizationLabel = (organization: AwardsOrganization) => {
  const segments = [organization.name];
  if (organization.shortName && organization.shortName.trim() !== '') {
    segments.push(`(${organization.shortName})`);
  }
  if (organization.country && organization.country.trim() !== '') {
    segments.push(`- ${organization.country}`);
  }
  return segments.join(' ');
};

export const formatCeremonyLabel = (ceremony: AwardsCeremony) => {
  const parts = [`${ceremony.year}年`];
  if (ceremony.ceremonyNumber) {
    parts.push(`第${ceremony.ceremonyNumber}回`);
  }
  return parts.join(' / ');
};
