import type {CeremonyListItem, OrganizationOption} from './types';

export const filterCeremonies = (
  ceremonies: CeremonyListItem[],
  query: string,
  organizationUid: string,
): CeremonyListItem[] => {
  const normalizedQuery = query.toLowerCase();

  return ceremonies.filter(ceremony => {
    const matchesOrganization =
      !organizationUid || ceremony.organizationUid === organizationUid;

    const matchesQuery =
      !normalizedQuery ||
      ceremony.organizationName.toLowerCase().includes(normalizedQuery) ||
      (ceremony.location ?? '').toLowerCase().includes(normalizedQuery) ||
      ceremony.year.toString().includes(query);

    return matchesOrganization && matchesQuery;
  });
};

export const organizationOptions = (
  ceremonies: CeremonyListItem[],
): OrganizationOption[] => {
  const unique = new Map<string, string>();
  for (const ceremony of ceremonies) {
    if (!unique.has(ceremony.organizationUid)) {
      unique.set(ceremony.organizationUid, ceremony.organizationName);
    }
  }

  const options = [...unique].map(([value, label]) => ({value, label}));

  return options.toSorted((a, b) => a.label.localeCompare(b.label, 'ja'));
};
